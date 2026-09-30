import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { formatDate, maskTypedDate, parseTypedDate } from "../../lib/dates.js";

/**
 * A date box that reads and shows DD/MM/YYYY on every PC.
 *
 * The browser's own date box shows dates in the PC's locale - on most Windows
 * PCs that is MM/DD/YYYY - which is not how any register, bill or cheque here
 * writes a date. This one is a text box: the slashes go in by themselves as
 * digits are typed, the value handed back is ISO ("2025-06-09", or "" until
 * the text is a real date), and the calendar button still opens the browser's
 * picker for anyone who would rather click.
 */
export function DateInput({
  id,
  value,
  onChange,
  required,
}: {
  id?: string;
  /** ISO YYYY-MM-DD, or "" for none. */
  value: string;
  onChange: (iso: string) => void;
  required?: boolean;
}): JSX.Element {
  const [text, setText] = useState(value ? formatDate(value) : "");
  const box = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  // A new value from outside (a record opened for editing, the calendar):
  // show it, unless it is what the text already says.
  useEffect(() => {
    if ((parseTypedDate(text) ?? "") !== value) setText(value ? formatDate(value) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const invalid = text.trim() !== "" && parseTypedDate(text) === null;
  useEffect(() => {
    // Keeps the form from being saved with a half-typed date.
    box.current?.setCustomValidity(invalid ? "DD/MM/YYYY" : "");
  }, [invalid]);

  return (
    <div className="date-input">
      <input
        ref={box}
        id={id}
        data-no-suggest
        className="num-input"
        inputMode="numeric"
        placeholder="DD/MM/YYYY"
        title="DD/MM/YYYY"
        required={required}
        value={text}
        style={invalid ? { borderColor: "var(--error-line)" } : undefined}
        onChange={(event) => {
          const typed = event.target.value;
          // Slashes are added while typing forward, never while deleting.
          const next = typed.length > text.length ? maskTypedDate(typed) : typed;
          setText(next);
          onChange(parseTypedDate(next) ?? "");
        }}
        onBlur={() => {
          const parsed = parseTypedDate(text);
          if (parsed) setText(formatDate(parsed));
        }}
      />
      <button
        type="button"
        className="ghost small date-input-picker"
        tabIndex={-1}
        aria-label="📅"
        onClick={() => {
          const input = picker.current;
          if (!input) return;
          input.value = value;
          try {
            input.showPicker();
          } catch {
            input.click();
          }
        }}
      >
        📅
      </button>
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        className="date-input-native"
        onChange={(event) => {
          if (event.target.value) onChange(event.target.value);
        }}
      />
    </div>
  );
}
