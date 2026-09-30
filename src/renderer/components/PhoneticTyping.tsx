import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { useStrings } from "../i18n/index.js";
import { PHONETIC_HELP, isPhoneticKey, toGujarati } from "../phonetic/transliterate.js";

/**
 * Typing Gujarati with English letters, in every text box of the app.
 *
 * A switch in the corner (or Ctrl+G) turns it on; from then on "shaaLaa"
 * typed in any text box comes out as શાળા, a word at a time, whatever keyboard
 * the PC has. It writes real Unicode Gujarati - the same text a Gujarati
 * keyboard would, so the books, the suggestions and the printed forms all
 * treat it alike. Mounted once, like Suggestions, so no screen changes.
 *
 * Boxes for figures and codes are left alone: amounts (inputMode decimal or
 * numeric), dates, e-mail, passwords, and anything marked data-no-suggest
 * (bill, voucher and cheque numbers).
 *
 * The choice is remembered on this PC, like the interface language: it is how
 * the person at this keyboard types, not a fact about a school.
 */

const STORAGE_KEY = "smc.phoneticTyping";

type TextField = HTMLInputElement | HTMLTextAreaElement;

function takesGujarati(target: EventTarget | null): target is TextField {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return false;
  if (target.readOnly || target.disabled) return false;
  if (target instanceof HTMLInputElement && !["text", "search"].includes(target.type)) return false;
  if (target.inputMode === "decimal" || target.inputMode === "numeric") return false;
  return target.closest("[data-no-suggest], [data-latin]") === null;
}

/** Set a React-controlled field's value the way typing would. */
function setValue(field: TextField, value: string, caret: number): void {
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.setSelectionRange(caret, caret);
}

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

/** The word being typed: where it starts, its English letters, its Gujarati. */
interface Word {
  field: TextField;
  start: number;
  latin: string;
  written: number;
}

export function PhoneticTyping(): JSX.Element {
  const t = useStrings();
  const [enabled, setEnabled] = useState(readStored);
  const [help, setHelp] = useState(false);
  const on = useRef(enabled);
  on.current = enabled;
  const word = useRef<Word | null>(null);

  const toggle = (next: boolean): void => {
    setEnabled(next);
    word.current = null;
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      // Not remembering the choice is no reason to refuse it.
    }
  };
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === "g") {
        event.preventDefault();
        toggleRef.current(!on.current);
        return;
      }
      if (!on.current || event.defaultPrevented) return;
      const field = event.target;
      if (!takesGujarati(field) || event.isComposing) {
        word.current = null;
        return;
      }
      if (event.ctrlKey || event.altKey || event.metaKey) {
        word.current = null;
        return;
      }

      const selStart = field.selectionStart ?? field.value.length;
      const selEnd = field.selectionEnd ?? selStart;
      const current = word.current;
      // Still the same word: same box, caret right after what was written.
      const continuing =
        current !== null &&
        current.field === field &&
        selStart === selEnd &&
        selStart === current.start + current.written;

      if (event.key === "Backspace") {
        if (!continuing || current.latin === "") {
          word.current = null;
          return;
        }
        event.preventDefault();
        const latin = current.latin.slice(0, -1);
        const out = toGujarati(latin);
        const value = field.value;
        setValue(field, value.slice(0, current.start) + out + value.slice(current.start + current.written), current.start + out.length);
        word.current = latin === "" ? null : { ...current, latin, written: out.length };
        return;
      }

      if (!isPhoneticKey(event.key)) {
        // A space, a digit, punctuation, an arrow: the word is finished.
        word.current = null;
        return;
      }

      event.preventDefault();
      const value = field.value;
      const base: Word = continuing
        ? current
        : { field, start: selStart, latin: "", written: selEnd - selStart };
      const latin = base.latin + event.key;
      const out = toGujarati(latin);
      const before = value.slice(0, base.start);
      const after = value.slice(base.start + base.written);
      if (field.maxLength > 0 && before.length + out.length + after.length > field.maxLength) return;
      setValue(field, before + out + after, base.start + out.length);
      word.current = { field, start: base.start, latin, written: out.length };
    };
    // A click or a new box starts a new word.
    const reset = (): void => {
      word.current = null;
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("mousedown", reset, true);
    document.addEventListener("focusin", reset);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("mousedown", reset, true);
      document.removeEventListener("focusin", reset);
    };
  }, []);

  return (
    <div className="phonetic-switch" onMouseDown={(event) => event.preventDefault()}>
      <button
        type="button"
        className={enabled ? "phonetic-toggle on" : "phonetic-toggle"}
        title={t.phoneticTitle}
        onClick={() => toggle(!enabled)}
      >
        <span className="phonetic-glyph">{enabled ? "ગુ" : "A"}</span>
        {enabled ? t.phoneticOn : t.phoneticOff}
        <kbd>Ctrl+G</kbd>
      </button>
      <button type="button" className="phonetic-help-button" title={t.phoneticHelp} onClick={() => setHelp(!help)}>
        ?
      </button>
      {help && (
        <div className="phonetic-help" role="dialog">
          <strong>{t.phoneticHelp}</strong>
          <table>
            <tbody>
              {PHONETIC_HELP.map(([keys, gujarati]) => (
                <tr key={keys}>
                  <td className="num-inline">{keys}</td>
                  <td>{gujarati}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">{t.phoneticHelpNote}</p>
        </div>
      )}
    </div>
  );
}
