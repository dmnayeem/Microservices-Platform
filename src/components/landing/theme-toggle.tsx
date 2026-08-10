"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

const STORAGE_KEY = "earngpt-landing-theme";

/** Visitor-facing light/dark toggle for the marketing surface. Flips
 *  `data-mk-theme` on #mk-root and remembers the choice — isolated from the
 *  in-app dashboard theme. */
export function ThemeToggle({
  className = "",
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    // Sync the icon to the theme the pre-paint boot script actually applied
    // (visitor's stored choice may differ from the SSR'd admin default).
    const cur = document
      .getElementById("mk-root")
      ?.getAttribute("data-mk-theme");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cur === "light" || cur === "dark") setTheme(cur);
  }, []);

  const toggle = () => {
    const el = document.getElementById("mk-root");
    if (!el) return;
    const next = el.getAttribute("data-mk-theme") === "dark" ? "light" : "dark";
    el.setAttribute("data-mk-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    setTheme(next);
  };

  const isDark = theme === "dark";
  const Icon = isDark ? Sun : Moon;
  const label = isDark ? "Light mode" : "Dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={label}
      className={
        className ||
        "inline-flex items-center justify-center gap-2 w-9 h-9 rounded-lg border border-(--mk-border) text-(--mk-muted) hover:text-(--mk-text) hover:bg-(--mk-surface-2) transition-colors"
      }
    >
      <Icon className="w-4.5 h-4.5" />
      {showLabel && <span className="text-sm font-medium">{label}</span>}
    </button>
  );
}
