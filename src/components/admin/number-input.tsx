"use client";

import { useState, type InputHTMLAttributes } from "react";

/**
 * A drop-in for `<input type="number">` in admin forms (owner, 2026-10-15).
 *
 * The plain one had two faults with the forms' `parseInt(v) || 0` handlers:
 *  - the 0 could not be deleted — clearing the box set it straight back to 0;
 *  - typing after the 0 showed "010": React treats "010" and 10 as the same
 *    number, so it never rewrote the box.
 *
 * This keeps what is typed as text, drops leading zeros ("010" → "10"), lets
 * the box sit empty while editing, and only on leaving an empty box hands the
 * form "" (so its own default applies). Same props as an <input>; `onChange`
 * receives `{ target: { value } }` like a change event.
 */
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type"> & {
  value: number | string | null | undefined;
  onChange?: (e: { target: { value: string } }) => void;
};

function clean(raw: string, decimal: boolean): string {
  let v = raw.replace(decimal ? /[^\d.-]/g : /[^\d-]/g, "");
  v = v.replace(/(?!^)-/g, ""); // a minus only in front
  if (decimal) {
    const i = v.indexOf(".");
    if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "");
  }
  // Leading zeros: "010" → "10", "-007" → "-7", but keep "0" and "0.5".
  return v.replace(/^(-?)0+(?=\d)/, "$1");
}

export function NumberInput({ value, onChange, onBlur, step, ...rest }: Props) {
  const decimal = step !== undefined && String(step) !== "1" && !Number.isInteger(Number(step));
  const shown = value === null || value === undefined ? "" : String(value);
  const [draft, setDraft] = useState(shown);
  const [editing, setEditing] = useState(false);
  const [lastShown, setLastShown] = useState(shown);

  // Follow the form's value when it changes from outside (reset, template…)
  // — adjusted during render, React's pattern for state derived from props.
  if (shown !== lastShown) {
    setLastShown(shown);
    if (!editing) setDraft(shown);
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode={decimal ? "decimal" : "numeric"}
      value={draft}
      onFocus={(e) => {
        setEditing(true);
        rest.onFocus?.(e);
      }}
      onChange={(e) => {
        const v = clean(e.target.value, decimal);
        setDraft(v);
        // An empty or half-typed box is not a number yet — wait.
        if (v !== "" && v !== "-" && v !== "." && !v.endsWith(".")) onChange?.({ target: { value: v } });
      }}
      onBlur={(e) => {
        setEditing(false);
        if (draft === "" || draft === "-" || draft === ".") {
          onChange?.({ target: { value: "" } });
          // Show whatever the form settles on (its default, often 0) — even
          // when that equals the value it had before, which would not count
          // as a change.
          setLastShown("\u0000");
        } else if (draft.endsWith(".")) {
          onChange?.({ target: { value: draft.slice(0, -1) } });
        }
        onBlur?.(e);
      }}
    />
  );
}
