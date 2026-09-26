/**
 * Country display helpers. Client-safe.
 *
 * Flags are small images, not emoji: Windows has no flag emoji and shows "BD"
 * as two letters instead — which is what most admins would have seen.
 */
let names: Intl.DisplayNames | null = null;

export function countryName(code: string | null | undefined): string {
  if (!code) return "Unknown";
  try {
    names ??= new Intl.DisplayNames(["en"], { type: "region" });
    return names.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function flagUrl(code: string, width: 20 | 40 | 80 = 40): string {
  return `https://flagcdn.com/w${width}/${code.toLowerCase()}.png`;
}
