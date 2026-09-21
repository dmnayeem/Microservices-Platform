"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";

/**
 * Light/dark switch for the in-app shell.
 *
 * Separate from `components/landing/theme-toggle.tsx` on purpose: that one
 * flips `data-mk-theme` on the marketing root and is deliberately isolated
 * from the dashboard, so a visitor's choice on the landing page does not
 * follow them into the app. This one drives the real app theme through
 * `useTheme()`.
 *
 * It lives one tap from every screen rather than only in Settings, because a
 * theme is something people change on a whim — in a dark room, in sunlight —
 * and a control buried three taps deep is one they will not find when they
 * want it. It moved out of the header ROW and into the account menu in the
 * same bar: a preference does not earn a permanent slot beside the controls
 * people press every day, and seven equal-weight controls in one row is what
 * "crowded" meant. `withLabel` is the menu-row form.
 *
 * "system" is a real stored value, so pressing this resolves it to whichever
 * side the user is NOT currently looking at, rather than assuming dark.
 */
export function ThemeSwitch({
  className = "",
  withLabel = false,
}: {
  className?: string;
  withLabel?: boolean;
}) {
  const { theme, setTheme, canChangeTheme } = useTheme();

  // Admin switch off: render nothing. The provider also refuses to act on
  // setTheme, so the guard holds even if some other surface renders a control.
  if (!canChangeTheme) return null;

  // `theme` may be "system"; ask the document what actually got applied so the
  // icon never contradicts the screen.
  const resolved =
    theme === "system"
      ? typeof document !== "undefined" &&
        document.documentElement.getAttribute("data-theme") === "light"
        ? "light"
        : "dark"
      : theme;
  const isLight = resolved === "light";

  return (
    <button
      type="button"
      onClick={() => setTheme(isLight ? "dark" : "light")}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      title={isLight ? "Dark mode" : "Light mode"}
      className={
        className ||
        // 44px so it is a real tap target on a phone, not a decorative icon.
        "app-tap app-press inline-flex items-center justify-center rounded-(--app-r-control) text-(--app-ink-2) hover:bg-(--shell-hover) hover:text-white"
      }
    >
      {isLight ? (
        <Moon className="h-4.5 w-4.5 shrink-0" />
      ) : (
        <Sun className="h-4.5 w-4.5 shrink-0" />
      )}
      {withLabel && <span>{isLight ? "Dark mode" : "Light mode"}</span>}
    </button>
  );
}
