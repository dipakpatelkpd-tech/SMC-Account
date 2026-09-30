import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { createPortal } from "react-dom";
import { useStrings } from "../i18n/index.js";
import { SuggestionStore, normalise } from "../suggestions/store.js";

/**
 * Suggestions for every text box in the app, from what was typed there before.
 *
 * One component, mounted once, that watches whichever field has focus - so no
 * screen has to be changed to get them, and a new field gets them for free.
 * A field's kind is its `data-suggest` key when it has one (shared by meaning:
 * the school's name on the setup form and in Masters is one list), otherwise
 * its screen and id. `data-no-suggest` opts a field out; passwords, dates,
 * numbers the browser handles itself, checkboxes and the like never take part.
 *
 * Values are remembered when a form is saved - every field in it at once - or,
 * for a field outside a form, when it is left after a change, and whenever a
 * suggestion is chosen.
 *
 *   ↑ ↓            move through the list (↓ also opens it)
 *   Tab            fill in the top suggestion - or the one moved to - once
 *                  something has been typed or chosen; otherwise Tab moves on,
 *                  so tabbing through an empty form never fills it by accident
 *   Enter          fill in the one moved to (otherwise Enter saves as always)
 *   Esc            close the list
 *   Shift+Delete   forget the one moved to; × does the same with the mouse
 */

type TextField = HTMLInputElement | HTMLTextAreaElement;

/** Input types that hold free text. Passwords are left out on purpose. */
const TEXT_TYPES = new Set(["text", "search", "email", "tel", "url"]);

/** The field's kind, or null when it takes no part. */
export function suggestKey(element: EventTarget | null): string | null {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return null;
  if (element.readOnly || element.disabled) return null;
  if (element instanceof HTMLInputElement && !TEXT_TYPES.has(element.type)) return null;
  if (element.closest("[data-no-suggest]")) return null;
  const explicit = element.dataset["suggest"];
  if (explicit) return explicit;
  const id = element.id || element.name;
  if (!id) return null;
  const screen = window.location.hash.replace(/^#/, "").split(/[:?]/)[0] || "app";
  return `${screen}:${id}`;
}

function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Set a React-controlled field's value the way typing would, so the screen's
 * own onChange sees it.
 */
function fill(field: TextField, value: string): void {
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  try {
    field.setSelectionRange(value.length, value.length);
  } catch {
    // Email fields do not support a selection; the caret is fine where it is.
  }
}

interface Open {
  field: TextField;
  key: string;
  items: string[];
  /** The item moved to with the arrows; -1 when none. */
  index: number;
  /** Something was typed since the field was entered. */
  typed: boolean;
}

export function Suggestions(): JSX.Element | null {
  const t = useStrings();
  const store = useMemo(() => new SuggestionStore(localStore()), []);
  const [open, setOpen] = useState<Open | null>(null);
  const current = useRef(open);
  current.current = open;
  // The value set by choosing a suggestion fires an input event; that one must
  // not reopen the list.
  const choosing = useRef(false);
  // Repositions the list when the page scrolls or the window changes size.
  const [, setFrame] = useState(0);

  useEffect(() => {
    const show = (field: TextField, key: string, typed: boolean, index = -1): void => {
      setOpen({ field, key, items: store.suggest(key, field.value), index, typed });
    };
    const choose = (state: Open, value: string): void => {
      choosing.current = true;
      fill(state.field, value);
      choosing.current = false;
      // Outside a form nothing else will remember it; inside one, saving will.
      if (!state.field.form) store.record(state.key, value);
      setOpen({ ...state, items: [], index: -1 });
    };

    const onFocusIn = (event: FocusEvent): void => {
      const key = suggestKey(event.target);
      if (!key) {
        setOpen(null);
        return;
      }
      const field = event.target as TextField;
      // Chromium's own autofill list would sit on top of this one.
      field.setAttribute("autocomplete", "off");
      show(field, key, false);
    };
    const onFocusOut = (event: FocusEvent): void => {
      if (current.current?.field === event.target) setOpen(null);
    };
    const onInput = (event: Event): void => {
      const state = current.current;
      if (!state || choosing.current || event.target !== state.field) return;
      show(state.field, state.key, true);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      const state = current.current;
      if (!state || event.target !== state.field) return;
      const count = state.items.length;
      switch (event.key) {
        case "ArrowDown":
          if (count === 0) {
            if (state.field instanceof HTMLInputElement) show(state.field, state.key, state.typed, 0);
            return;
          }
          event.preventDefault();
          setOpen({ ...state, index: (state.index + 1) % count });
          return;
        case "ArrowUp":
          if (count === 0) return;
          event.preventDefault();
          setOpen({ ...state, index: state.index <= 0 ? count - 1 : state.index - 1 });
          return;
        case "Enter":
          if (count > 0 && state.index >= 0) {
            event.preventDefault();
            choose(state, state.items[state.index]!);
          }
          return;
        case "Tab":
          if (!event.shiftKey && count > 0 && (state.typed || state.index >= 0)) {
            event.preventDefault();
            choose(state, state.items[Math.max(0, state.index)]!);
          }
          return;
        case "Escape":
          if (count > 0) {
            // Close the list only - not the dialog or editor around the field.
            event.preventDefault();
            event.stopPropagation();
            setOpen({ ...state, items: [], index: -1 });
          }
          return;
        case "Delete":
          if (event.shiftKey && count > 0 && state.index >= 0) {
            event.preventDefault();
            store.remove(state.key, state.items[state.index]!);
            show(state.field, state.key, state.typed, Math.min(state.index, count - 2));
          }
          return;
      }
    };
    // A saved form: remember every field in it, before the screen clears them.
    const onSubmit = (event: Event): void => {
      const form = event.target as HTMLFormElement;
      for (const field of form.querySelectorAll("input, textarea")) {
        const key = suggestKey(field);
        if (key) store.record(key, (field as TextField).value);
      }
    };
    // A field outside any form: remember it when it is left after a change.
    const onChange = (event: Event): void => {
      const key = suggestKey(event.target);
      const field = event.target as TextField;
      if (key && !field.form) store.record(key, field.value);
    };
    const onMove = (): void => setFrame((frame) => frame + 1);

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("input", onInput, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("change", onChange, true);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("change", onChange, true);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [store]);

  if (!open || open.items.length === 0 || !open.field.isConnected) return null;

  const rect = open.field.getBoundingClientRect();
  // Below the field, or above it when there is no room below.
  const below = window.innerHeight - rect.bottom > 260 || rect.top < 260;
  const typed = normalise(open.field.value).toLocaleLowerCase("en");

  const chooseWithMouse = (value: string): void => {
    const state = open;
    choosing.current = true;
    fill(state.field, value);
    choosing.current = false;
    if (!state.field.form) store.record(state.key, value);
    setOpen({ ...state, items: [], index: -1 });
  };
  const forget = (value: string): void => {
    store.remove(open.key, value);
    setOpen({ ...open, items: store.suggest(open.key, open.field.value), index: -1 });
  };

  return createPortal(
    <div
      className="suggest-popup"
      role="listbox"
      style={{
        left: rect.left,
        width: Math.max(rect.width, 240),
        ...(below ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }),
      }}
      // Clicking the list must not take focus from the field.
      onMouseDown={(event) => event.preventDefault()}
    >
      {open.items.map((item, index) => {
        const at = typed === "" ? -1 : item.toLocaleLowerCase("en").indexOf(typed);
        return (
          <div
            key={item}
            role="option"
            aria-selected={index === open.index}
            className={`suggest-item${index === open.index ? " active" : ""}`}
            onClick={() => chooseWithMouse(item)}
          >
            <span className="suggest-text">
              {at < 0 ? (
                item
              ) : (
                <>
                  {item.slice(0, at)}
                  <strong>{item.slice(at, at + typed.length)}</strong>
                  {item.slice(at + typed.length)}
                </>
              )}
            </span>
            {index === Math.max(0, open.index) && (open.typed || open.index >= 0) && (
              <kbd className="suggest-kbd">Tab</kbd>
            )}
            <button
              type="button"
              className="suggest-remove"
              title={t.suggestRemove}
              onClick={(event) => {
                event.stopPropagation();
                forget(item);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
      <div className="suggest-help">{t.suggestHelp}</div>
    </div>,
    document.body,
  );
}
