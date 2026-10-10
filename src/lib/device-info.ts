/**
 * What kind of device a visitor is on — phone / tablet / computer, Android /
 * iPhone / Windows / Mac…, the phone brand (Samsung, Xiaomi, Symphony…) and the
 * browser. Pure and client-safe: the browser runs it with Client Hints (the
 * only way to learn an Android phone's model since Chrome stopped putting it
 * in the user agent), the server runs it on the user-agent header when that is
 * all it has. One parser, so the report and every targeting rule agree.
 *
 * Used by: the device report (/admin/devices), and device targeting on
 * notifications & email, tasks, banners and popups (lib/device-target.ts).
 */

export type DeviceType = "mobile" | "tablet" | "desktop";

export interface DeviceInfo {
  type: DeviceType;
  os: string;
  osVersion: string | null;
  brand: string | null;
  model: string | null;
  browser: string;
}

/** Optional User-Agent Client Hints (navigator.userAgentData). */
export interface DeviceHints {
  mobile?: boolean | null;
  platform?: string | null;
  platformVersion?: string | null;
  model?: string | null;
}

// ── Catalogs (labels shown in the admin; keys are what is stored) ───────────

export const DEVICE_TYPES: { key: DeviceType; label: string }[] = [
  { key: "mobile", label: "Mobile phone" },
  { key: "tablet", label: "Tablet" },
  { key: "desktop", label: "Computer" },
];

export const DEVICE_OSES: { key: string; label: string }[] = [
  { key: "android", label: "Android" },
  { key: "ios", label: "iPhone (iOS)" },
  { key: "ipados", label: "iPad" },
  { key: "windows", label: "Windows" },
  { key: "macos", label: "Mac" },
  { key: "linux", label: "Linux" },
  { key: "chromeos", label: "Chromebook" },
  { key: "other", label: "Other" },
];

export const DEVICE_BRANDS: { key: string; label: string }[] = [
  { key: "samsung", label: "Samsung" },
  { key: "xiaomi", label: "Xiaomi / Redmi / POCO" },
  { key: "apple", label: "Apple" },
  { key: "oppo", label: "Oppo" },
  { key: "realme", label: "Realme" },
  { key: "vivo", label: "vivo / iQOO" },
  { key: "oneplus", label: "OnePlus" },
  { key: "tecno", label: "Tecno" },
  { key: "infinix", label: "Infinix" },
  { key: "itel", label: "itel" },
  { key: "symphony", label: "Symphony" },
  { key: "walton", label: "Walton" },
  { key: "huawei", label: "Huawei" },
  { key: "honor", label: "Honor" },
  { key: "google", label: "Google Pixel" },
  { key: "motorola", label: "Motorola" },
  { key: "nokia", label: "Nokia" },
  { key: "nothing", label: "Nothing" },
  { key: "sony", label: "Sony" },
  { key: "lg", label: "LG" },
  { key: "asus", label: "Asus" },
  { key: "lenovo", label: "Lenovo" },
  { key: "zte", label: "ZTE" },
  { key: "other", label: "Other / unknown" },
];

export const DEVICE_BROWSERS: { key: string; label: string }[] = [
  { key: "chrome", label: "Chrome" },
  { key: "safari", label: "Safari" },
  { key: "samsung", label: "Samsung Internet" },
  { key: "edge", label: "Edge" },
  { key: "firefox", label: "Firefox" },
  { key: "opera", label: "Opera" },
  { key: "uc", label: "UC Browser" },
  { key: "facebook", label: "Facebook app" },
  { key: "instagram", label: "Instagram app" },
  { key: "other", label: "Other" },
];

const labelOf = (list: { key: string; label: string }[], key: string | null | undefined, fallback = "Unknown") =>
  (key && list.find((x) => x.key === key)?.label) || (key ? key : fallback);

export const deviceTypeLabel = (k: string | null | undefined) => labelOf(DEVICE_TYPES, k);
export const deviceOsLabel = (k: string | null | undefined) => labelOf(DEVICE_OSES, k);
export const deviceBrandLabel = (k: string | null | undefined) => labelOf(DEVICE_BRANDS, k, "Unknown");
export const deviceBrowserLabel = (k: string | null | undefined) => labelOf(DEVICE_BROWSERS, k);

/** "Samsung SM-A536E · Android 14 · Chrome" */
export function describeDevice(d: Partial<DeviceInfo> | null | undefined): string {
  if (!d) return "Unknown device";
  const brand = d.brand && d.brand !== "other" ? deviceBrandLabel(d.brand).split(" / ")[0] : null;
  // "Symphony Z60" already says the brand; "SM-A536E" does not.
  const modelHasBrand = !!(brand && d.model && d.model.toLowerCase().includes(brand.toLowerCase()));
  const name = [modelHasBrand ? null : brand, d.model].filter(Boolean).join(" ") || deviceTypeLabel(d.type);
  const os = d.os ? `${deviceOsLabel(d.os)}${d.osVersion ? ` ${d.osVersion}` : ""}` : null;
  return [name, os, d.browser ? deviceBrowserLabel(d.browser) : null].filter(Boolean).join(" · ");
}

// ── Brand from an Android model code ────────────────────────────────────────
// Ordered: first match wins. Model codes, not marketing names, are what the
// phone reports ("SM-A536E", "23129RAA4G", "RMX3710", "V2250", "CPH2591").
const BRAND_RULES: [RegExp, string][] = [
  [/samsung|^SM-|^GT-|^SCH-|^SHV-|galaxy/i, "samsung"],
  [/^ONEPLUS|^(IN|LE|KB|NE|HD|GM|AC|BE|DN|EB|MT|PJ|PH|CPH25)\d{3,4}/i, "oneplus"],
  [/realme|^RMX\d/i, "realme"],
  [/^OPPO|^CPH\d|^PE[A-Z]M\d|^P[A-Z]{2}M\d/i, "oppo"],
  [/^vivo|^iQOO|^V\d{4}[A-Z]?$|^I\d{4}$/i, "vivo"],
  [/xiaomi|redmi|poco|^MI[ \d]|^M\d{4}[A-Z]\d|^2[0-4]\d{2}[0-9A-Z]{4,}/i, "xiaomi"],
  [/tecno/i, "tecno"],
  [/infinix/i, "infinix"],
  [/^itel/i, "itel"],
  [/symphony/i, "symphony"],
  [/walton|^primo/i, "walton"],
  [/honor/i, "honor"],
  [/huawei|^[A-Z]{3}-(L|AL|TL|LX|AN|NX)\d/i, "huawei"],
  [/^pixel/i, "google"],
  [/^moto|motorola|^XT\d{4}/i, "motorola"],
  [/nokia|^TA-\d{4}/i, "nokia"],
  [/^nothing|^A0(59|63|65|142)/i, "nothing"],
  [/sony|^(SO-|SOV|XQ-)/i, "sony"],
  [/^LG|^LM-/i, "lg"],
  [/asus|^ASUS_|^I00\dD/i, "asus"],
  [/lenovo|^TB-/i, "lenovo"],
  [/^ZTE|^Blade/i, "zte"],
];

export function brandFromModel(model: string | null | undefined): string | null {
  const m = (model ?? "").trim();
  if (!m || m === "K") return null;
  for (const [re, brand] of BRAND_RULES) if (re.test(m)) return brand;
  return "other";
}

/** The model inside an Android UA: "…Android 14; SM-A536E Build/…)" → "SM-A536E". */
function androidModel(ua: string): string | null {
  const m = ua.match(/Android [\d.]+;\s*(?:[a-z]{2}[-_][a-z]{2};\s*)?([^;)]+?)(?:\s+Build\/|\)|;)/i);
  const model = m?.[1]?.trim() ?? null;
  // Chrome's reduced user agent hides the model as "K".
  if (!model || model === "K" || /^wv$/i.test(model)) return null;
  return model.slice(0, 60);
}

function browserOf(ua: string): string {
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "facebook";
  if (/Instagram/i.test(ua)) return "instagram";
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/Edg(e|A|iOS)?\//i.test(ua)) return "edge";
  if (/OPR\/|Opera|OPiOS/i.test(ua)) return "opera";
  if (/UCBrowser|UCWEB/i.test(ua)) return "uc";
  if (/Firefox|FxiOS/i.test(ua)) return "firefox";
  if (/Chrome|CriOS|Chromium/i.test(ua)) return "chrome";
  if (/Safari/i.test(ua)) return "safari";
  return "other";
}

export function parseDevice(uaRaw: string | null | undefined, hints: DeviceHints = {}): DeviceInfo {
  const ua = uaRaw ?? "";
  const browser = browserOf(ua);
  const platform = (hints.platform ?? "").toLowerCase();

  // Apple first: an iPad on iPadOS 13+ asks for the desktop site, but the
  // browser side can still tell it apart (touch points) and passes "iPad".
  if (/iPad/i.test(ua) || platform === "ipados") {
    const v = ua.match(/OS (\d+)[_.](\d+)/);
    return { type: "tablet", os: "ipados", osVersion: v ? `${v[1]}.${v[2]}` : null, brand: "apple", model: "iPad", browser };
  }
  if (/iPhone|iPod/i.test(ua) || platform === "ios") {
    const v = ua.match(/OS (\d+)[_.](\d+)/);
    return { type: "mobile", os: "ios", osVersion: v ? `${v[1]}.${v[2]}` : null, brand: "apple", model: "iPhone", browser };
  }
  if (/Android/i.test(ua) || platform === "android") {
    const model = (hints.model?.trim() || null) ?? androidModel(ua);
    const v = hints.platformVersion?.split(".")[0] || ua.match(/Android (\d+)/)?.[1] || null;
    const mobile = hints.mobile ?? /Mobile/i.test(ua);
    return {
      type: mobile ? "mobile" : "tablet",
      os: "android",
      osVersion: v,
      brand: brandFromModel(model),
      model: model ? model.slice(0, 60) : null,
      browser,
    };
  }
  if (/CrOS/i.test(ua) || platform === "chrome os") {
    return { type: "desktop", os: "chromeos", osVersion: null, brand: null, model: null, browser };
  }
  if (/Windows NT/i.test(ua) || platform === "windows") {
    // Windows 11 still says "NT 10.0"; Client Hints tell them apart.
    const major = Number(hints.platformVersion?.split(".")[0] ?? NaN);
    const v = Number.isFinite(major) ? (major >= 13 ? "11" : "10") : ua.match(/Windows NT 10/) ? "10/11" : null;
    return { type: "desktop", os: "windows", osVersion: v, brand: null, model: null, browser };
  }
  if (/Macintosh|Mac OS X/i.test(ua) || platform === "macos") {
    return { type: "desktop", os: "macos", osVersion: null, brand: "apple", model: "Mac", browser };
  }
  if (/Linux|X11/i.test(ua) || platform === "linux") {
    return { type: "desktop", os: "linux", osVersion: null, brand: null, model: null, browser };
  }
  const mobile = hints.mobile ?? /Mobile|KAIOS|Opera Mini/i.test(ua);
  return { type: mobile ? "mobile" : "desktop", os: "other", osVersion: null, brand: null, model: null, browser };
}

// ── Compact form for the `rt_dev` cookie (current device, read server-side) ──

export const DEVICE_COOKIE_NAME = "rt_dev";

export function encodeDeviceCookie(d: DeviceInfo): string {
  return [d.type, d.os, d.brand ?? "", d.browser].join("|");
}

export function decodeDeviceCookie(v: string | null | undefined): Pick<DeviceInfo, "type" | "os" | "brand" | "browser"> | null {
  if (!v) return null;
  const [type, os, brand, browser] = decodeURIComponent(v).split("|");
  if (!DEVICE_TYPES.some((t) => t.key === type) || !DEVICE_OSES.some((o) => o.key === os)) return null;
  return {
    type: type as DeviceType,
    os,
    brand: brand && DEVICE_BRANDS.some((b) => b.key === brand) ? brand : null,
    browser: DEVICE_BROWSERS.some((b) => b.key === browser) ? browser : "other",
  };
}
