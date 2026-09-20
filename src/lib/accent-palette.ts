/**
 * The accent surface table — one row per accent, and the only place these
 * colours are written down.
 *
 * WHY THIS FILE EXISTS
 * The app ships 19 accents (profile → Theme). Every one of them remaps the
 * brand ramp, and the app's one gradient, its active-nav rail and its button
 * edge are all drawn from that ramp. Exactly ONE accent had ever been measured:
 * the default. At the 600 step that the gradient needs for white text, a light
 * accent lands near 2.9:1 — so choosing "yellow" or "gold" produced white
 * labels on a bright fill, on the balance panel, and nothing anywhere caught
 * it. The picker was never the problem; not measuring was.
 *
 * HOW THE VALUES WERE CHOSEN — all three rules are mechanical, not taste:
 *
 *   gradA / gradB      The first step, walking 500 → 900, at which WHITE clears
 *                      4.7:1 on BOTH ends (4.5 plus headroom). Cool accents
 *                      settle at 600; every warm one has to step to 700, and
 *                      silver to 800. `gradB` is the accent's companion hue —
 *                      about 30 degrees around the wheel, warm to warm and cool
 *                      to cool — at the same step, which is what makes it read
 *                      as a gradient rather than a flat fill. Where the
 *                      companion lands more than 1.7x away in luminance
 *                      (silver → slate is a silver-to-near-black wash) the row
 *                      falls back to the accent's own ramp one step deeper.
 *
 *   railADark/BDark    The rail, the tab underline and the button edge carry NO
 *   railALight/BLight  text, so their floor is 3:1 against the CHROME, and that
 *                      is a different colour in each theme. Each theme starts
 *                      from the most vivid step that reads on its bar and moves
 *                      only as far as the floor forces it: 400 on the near-black
 *                      bar, 500 on the white one. The two can end up far apart —
 *                      silver is 400 (#c7ced9) in dark and 700 (#6b7688) in
 *                      light, four steps in the opposite direction — which is
 *                      the whole reason they are separate columns.
 *
 * The CSS in globals.css is GENERATED from this table by `accentSurfaceCss()`,
 * and `scripts/verify-app-shell.ts` asserts the stylesheet still contains
 * exactly that string, recomputes every ratio in the table on every run, and
 * fails if the accent list here drifts from `ACCENTS` in the theme provider.
 * So the numbers cannot rot and a new accent cannot ship unmeasured.
 *
 * To change a row: edit it here, run the verify script, and paste the block it
 * prints into globals.css. Never hand-edit the generated block.
 */

export interface AccentSurface {
  /** Gradient start. White on it clears 4.5:1. */
  gradA: string;
  /** Gradient end (companion hue, same step). White on it clears 4.5:1. */
  gradB: string;
  /** Rail / underline / button edge on the DARK chrome bar. 3:1 non-text. */
  railADark: string;
  railBDark: string;
  /** Same, on the WHITE chrome bar. Often a very different step. */
  railALight: string;
  railBLight: string;
}

export const ACCENT_SURFACE: Record<string, AccentSurface> = {
  red: { gradA: "#c10007", gradB: "#c70036", railADark: "#ff6467", railBDark: "#ff637e", railALight: "#fb2c36", railBLight: "#ff2056" },
  orange: { gradA: "#ca3500", gradB: "#bb4d00", railADark: "#ff8904", railBDark: "#ffb900", railALight: "#ca3500", railBLight: "#bb4d00" },
  amber: { gradA: "#bb4d00", gradB: "#ca3500", railADark: "#ffb900", railBDark: "#ff8904", railALight: "#bb4d00", railBLight: "#ca3500" },
  yellow: { gradA: "#a65f00", gradB: "#bb4d00", railADark: "#fdc700", railBDark: "#ffb900", railALight: "#a65f00", railBLight: "#bb4d00" },
  lime: { gradA: "#497d00", gradB: "#008236", railADark: "#9ae600", railBDark: "#05df72", railALight: "#497d00", railBLight: "#008236" },
  green: { gradA: "#008236", gradB: "#007a55", railADark: "#05df72", railBDark: "#00d492", railALight: "#00a63e", railBLight: "#009966" },
  // Retuned to the launch design (Emerald Freelance Nexus / Obsidian Kinetic).
  // Its own #059669 carries white at 3.77:1, under the floor, so the fill steps
  // one deeper: #047857 is 5.48 and #065f46 is 7.68. The light rail keeps
  // #059669 (3.77 on the white bar, and a rail carries no text); #10b981 is
  // 2.54 there and cannot be a light-theme mark.
  emerald: { gradA: "#047857", gradB: "#065f46", railADark: "#34d399", railBDark: "#10b981", railALight: "#059669", railBLight: "#047857" },
  teal: { gradA: "#00786f", gradB: "#007595", railADark: "#00d5be", railBDark: "#00d3f2", railALight: "#009689", railBLight: "#0092b8" },
  cyan: { gradA: "#007595", gradB: "#0069a8", railADark: "#00d3f2", railBDark: "#00bcff", railALight: "#0092b8", railBLight: "#0084d1" },
  sky: { gradA: "#0069a8", gradB: "#1447e6", railADark: "#00bcff", railBDark: "#51a2ff", railALight: "#0084d1", railBLight: "#155dfc" },
  blue: { gradA: "#155dfc", gradB: "#4f39f6", railADark: "#51a2ff", railBDark: "#7c86ff", railALight: "#2b7fff", railBLight: "#615fff" },
  indigo: { gradA: "#4f39f6", gradB: "#7f22fe", railADark: "#7c86ff", railBDark: "#a684ff", railALight: "#615fff", railBLight: "#8e51ff" },
  violet: { gradA: "#7f22fe", gradB: "#9810fa", railADark: "#a684ff", railBDark: "#c27aff", railALight: "#8e51ff", railBLight: "#ad46ff" },
  purple: { gradA: "#8200db", gradB: "#a800b7", railADark: "#c27aff", railBDark: "#ed6aff", railALight: "#ad46ff", railBLight: "#e12afb" },
  fuchsia: { gradA: "#a800b7", gradB: "#c6005c", railADark: "#ed6aff", railBDark: "#fb64b6", railALight: "#e12afb", railBLight: "#f6339a" },
  pink: { gradA: "#c6005c", gradB: "#c70036", railADark: "#fb64b6", railBDark: "#ff637e", railALight: "#f6339a", railBLight: "#ff2056" },
  rose: { gradA: "#c70036", gradB: "#c10007", railADark: "#ff637e", railBDark: "#ff6467", railALight: "#ff2056", railBLight: "#fb2c36" },
  gold: { gradA: "#8a6b18", gradB: "#bb4d00", railADark: "#e3c15a", railBDark: "#ffb900", railALight: "#8a6b18", railBLight: "#bb4d00" },
  silver: { gradA: "#535c6b", gradB: "#3c434f", railADark: "#c7ced9", railBDark: "#90a1b9", railALight: "#6b7688", railBLight: "#314158" },
};

/** The accent that ships when nobody has chosen one. */
export const DEFAULT_ACCENT = "emerald";

/**
 * The generated stylesheet block.
 *
 * The dark values are declared WITHOUT a theme selector, so every token has a
 * value in both themes and the light block only refines the three that must
 * differ. A token that exists solely under `[data-theme="light"]` is unset in
 * dark, and an unset colour is not a fallback — it is nothing.
 */
export function accentSurfaceCss(): string {
  const out: string[] = [];
  for (const [name, a] of Object.entries(ACCENT_SURFACE)) {
    out.push(
      `html[data-accent="${name}"] {\n` +
        `  --app-grad-a: ${a.gradA};\n` +
        `  --app-grad-b: ${a.gradB};\n` +
        `  --app-accent-edge: ${a.railADark};\n` +
        `  --app-rail-a: ${a.railADark};\n` +
        `  --app-rail-b: ${a.railBDark};\n` +
        `}\n` +
        `html[data-theme="light"][data-accent="${name}"] {\n` +
        `  --app-accent-edge: ${a.railALight};\n` +
        `  --app-rail-a: ${a.railALight};\n` +
        `  --app-rail-b: ${a.railBLight};\n` +
        `}`
    );
  }
  return out.join("\n");
}
