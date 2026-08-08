"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export type Theme = "dark" | "light" | "system";
export type Accent =
  | "red" | "orange" | "amber" | "yellow" | "lime" | "green" | "emerald"
  | "teal" | "cyan" | "sky" | "blue" | "indigo" | "violet" | "purple"
  | "fuchsia" | "pink" | "rose" | "gold" | "silver";

export const ACCENTS: Accent[] = [
  "red", "orange", "amber", "yellow", "lime", "green", "emerald",
  "teal", "cyan", "sky", "blue", "indigo", "violet", "purple",
  "fuchsia", "pink", "rose", "gold", "silver",
];

/** Swatch preview hex per accent (the -500 shade). Shared by the pickers. */
export const ACCENT_HEX: Record<Accent, string> = {
  red: "#ef4444", orange: "#f97316", amber: "#f59e0b", yellow: "#eab308",
  lime: "#84cc16", green: "#22c55e", emerald: "#10b981", teal: "#14b8a6",
  cyan: "#06b6d4", sky: "#0ea5e9", blue: "#3b82f6", indigo: "#6366f1",
  violet: "#8b5cf6", purple: "#a855f7", fuchsia: "#d946ef", pink: "#ec4899",
  rose: "#f43f5e", gold: "#d4af37", silver: "#b6bec9",
};

/** Metallic accents get a gradient swatch preview (a flat CSS var can't hold a
 *  gradient, so the picker uses this for sheen; the applied accent stays flat). */
export const ACCENT_GRADIENT: Partial<Record<Accent, string>> = {
  gold: "linear-gradient(135deg,#f7e08b 0%,#d4af37 45%,#a67c1a 100%)",
  silver: "linear-gradient(135deg,#eef1f6 0%,#b6bec9 45%,#8892a1 100%)",
};

type ThemeContextType = {
  theme: Theme; // the raw preference (may be "system")
  setTheme: (theme: Theme) => void;
  accent: Accent;
  setAccent: (accent: Accent) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const ACCENT_KEY = "earngpt-accent";

/** Resolve the raw theme preference to the concrete "dark"/"light" applied. */
function resolveTheme(theme: Theme): "dark" | "light" {
  if (theme === "system") {
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: light)").matches
    ) {
      return "light";
    }
    return "dark";
  }
  return theme;
}

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  storageKey = "earngpt-theme",
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}) {
  // Start from defaults on BOTH server and first client render so the tree
  // renders identically (no hydration mismatch) — then hydrate the stored
  // preference in a post-mount effect below. The actual visual theme is already
  // applied to <html> by the inline script in layout.tsx before first paint, so
  // there's no flash while the context catches up.
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [accent, setAccentState] = useState<Accent>("indigo");

  // Hydrate persisted preferences once, after mount. Reading localStorage here
  // (not in the useState initializer) is deliberate: it keeps the server and
  // first client render identical (default values) so there's no hydration
  // mismatch, then syncs the real preference in. The one-time setState is the
  // intended pattern for this — hence the rule disable.
  useEffect(() => {
    const storedTheme = localStorage.getItem(storageKey) as Theme | null;
    if (storedTheme === "dark" || storedTheme === "light" || storedTheme === "system") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setThemeState(storedTheme);
    }
    const storedAccent = localStorage.getItem(ACCENT_KEY) as Accent | null;
    if (storedAccent && ACCENTS.includes(storedAccent)) setAccentState(storedAccent);
  }, [storageKey]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    if (typeof window !== "undefined") localStorage.setItem(storageKey, next);
  };

  const setAccent = (next: Accent) => {
    setAccentState(next);
    if (typeof window !== "undefined") localStorage.setItem(ACCENT_KEY, next);
  };

  // Apply the resolved theme; when "system", follow OS changes live. The inline
  // script in layout.tsx already set the correct data-theme before first paint,
  // so skip the initial run (avoids a flash before the stored pref hydrates) —
  // only take over on actual preference changes.
  const themeInited = useRef(false);
  useEffect(() => {
    const apply = () =>
      document.documentElement.setAttribute("data-theme", resolveTheme(theme));
    if (themeInited.current) apply();
    else themeInited.current = true;
    if (theme === "system" && window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);

  // Apply the accent as a data attribute (CSS remaps the brand ramp). Same
  // skip-initial rule — the inline script already set data-accent pre-paint.
  const accentInited = useRef(false);
  useEffect(() => {
    if (accentInited.current) {
      document.documentElement.setAttribute("data-accent", accent);
    } else {
      accentInited.current = true;
    }
  }, [accent]);

  // NOTE: intentionally NO `if (!hasMounted) return null` gate — that blanked the
  // entire app (page + loading skeleton) until the client bundle hydrated,
  // defeating SSR streaming. Children now render on the server and stream in.
  return (
    <ThemeContext.Provider value={{ theme, setTheme, accent, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
