"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/user/primitives/avatar";
import { cn } from "@/lib/utils";

/**
 * `@` autocomplete for the composer and the comment box.
 *
 * Mentions already worked end to end — the server parses `@handle`, resolves the
 * user, writes a `Mention` row, credits and notifies, and `RenderedContent`
 * renders the link. The one missing piece was discoverability: you had to know
 * someone's exact handle and type it blind. This closes that, and changes
 * nothing server-side.
 *
 * Queries `/api/users/search`, which already matches `startsWith` on username
 * AND `contains` on name — so people are findable by either.
 *
 * Works against an `<input>` or a `<textarea>` because both expose
 * `selectionStart` and `setSelectionRange`; the comment box is one and the
 * composer is the other.
 */

/** Mirrors the handle charset in `lib/mentions.ts` and the server parser. */
const TOKEN_RE = /(?:^|[^a-zA-Z0-9._-])@([a-zA-Z0-9_][a-zA-Z0-9._-]{0,29})$/;

interface Suggestion {
  id: string;
  name: string | null;
  username: string | null;
  avatar: string | null;
}

type Field = HTMLInputElement | HTMLTextAreaElement;

export function useMentionAutocomplete({
  value,
  onChange,
  fieldRef,
}: {
  value: string;
  onChange: (next: string) => void;
  fieldRef: React.RefObject<Field | null>;
}) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  // The `@word` currently being typed, and where it starts.
  const tokenRef = useRef<{ start: number; query: string } | null>(null);

  const dismiss = useCallback(() => {
    setOpen(false);
    setItems([]);
    tokenRef.current = null;
  }, []);

  // Look at the text immediately BEFORE the caret. Anything after it belongs to
  // a different word, so a mention edited mid-sentence still resolves correctly.
  //
  // Every state change lives inside the debounce timer rather than the effect
  // body. That is not a formality: setting state synchronously here would
  // re-render on each keystroke, and `value` is this effect's own dependency.
  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const m = value.slice(0, caret).match(TOKEN_RE);
    const query = m?.[1] ?? null;

    let cancel = false;
    const t = setTimeout(() => {
      if (cancel) return;
      // Not typing a handle any more (or nothing after the @ yet).
      if (!query) {
        tokenRef.current = null;
        setItems([]);
        setOpen(false);
        return;
      }
      tokenRef.current = { start: caret - query.length - 1, query };
      fetch(`/api/users/search?q=${encodeURIComponent(query)}&limit=6`)
        .then((r) => (r.ok ? r.json() : { users: [] }))
        .then((d) => {
          if (cancel) return;
          const users: Suggestion[] = (d.users ?? []).filter(
            (u: Suggestion) => !!u.username
          );
          setItems(users);
          setActive(0);
          setOpen(users.length > 0);
        })
        .catch(() => {
          if (!cancel) setOpen(false);
        });
    }, 140); // one request per pause, not per keystroke
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [value, fieldRef]);

  /** Swap the typed token for the real handle and put the caret after it. */
  const insert = useCallback(
    (u: Suggestion) => {
      const tok = tokenRef.current;
      const el = fieldRef.current;
      if (!tok || !u.username) return;
      const caret = el?.selectionStart ?? value.length;
      const next =
        value.slice(0, tok.start) + `@${u.username} ` + value.slice(caret);
      onChange(next);
      dismiss();
      // Restore the caret after React re-renders with the new value.
      const pos = tok.start + u.username.length + 2;
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(pos, pos);
      });
    },
    [value, onChange, fieldRef, dismiss]
  );

  /**
   * Give this to the field's `onKeyDown`. Returns true when it handled the key,
   * so the caller can skip its own behaviour — otherwise Enter would submit the
   * comment instead of picking the highlighted name.
   */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!open || items.length === 0) return false;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % items.length);
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insert(items[active]);
        return true;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
        return true;
      }
      return false;
    },
    [open, items, active, insert, dismiss]
  );

  return { open, items, active, setActive, insert, onKeyDown, dismiss };
}

/** The suggestion list. Positioned by the caller — the composer opens it
 *  downward, the comment box upward, because of where each sits on screen. */
export function MentionSuggestions({
  items,
  active,
  onPick,
  onHover,
  className,
}: {
  items: Suggestion[];
  active: number;
  onPick: (u: Suggestion) => void;
  onHover: (i: number) => void;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div
      className={cn(
        "absolute z-50 w-64 max-w-[calc(100vw-2rem)] p-1 rounded-xl bg-gray-900 border border-gray-800 shadow-xl",
        className
      )}
      role="listbox"
    >
      {items.map((u, i) => (
        <button
          key={u.id}
          type="button"
          role="option"
          aria-selected={i === active}
          // pointerDown, not click: the field blurs on click and the list would
          // unmount before the handler ran.
          onPointerDown={(e) => {
            e.preventDefault();
            onPick(u);
          }}
          onPointerEnter={() => onHover(i)}
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors",
            i === active ? "bg-gray-800" : "hover:bg-gray-800/60"
          )}
        >
          <Avatar src={u.avatar} size={26} name={u.name} />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-white truncate">
              {u.name || u.username}
            </span>
            <span className="block text-[11px] text-gray-500 truncate">
              @{u.username}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
