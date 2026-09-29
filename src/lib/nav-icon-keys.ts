/**
 * The icon KEYS an admin can pick for any navigation surface (Quick Earn
 * tiles, the phone tab bar, header shortcuts, the sidebar menu).
 *
 * Kept apart from `nav-icons.ts` on purpose: this file has no lucide import,
 * so the settings validator (`setting-guards.ts`, imported by scripts and by
 * small admin forms) can check a stored key without pulling sixty icon
 * components into every bundle that validates a setting.
 *
 * Stored settings hold these keys, never component names — so renaming a
 * lucide export never breaks a saved menu. Every key the old Quick Earn map
 * used (`zap`, `gamepad`, `graduation`, …) is still here with its old meaning.
 */
export const NAV_ICON_OPTIONS = [
  // Navigation
  { key: "home", label: "Home", group: "Navigation" },
  { key: "layoutDashboard", label: "Dashboard", group: "Navigation" },
  { key: "layoutGrid", label: "Grid", group: "Navigation" },
  { key: "compass", label: "Compass", group: "Navigation" },
  { key: "search", label: "Search", group: "Navigation" },
  { key: "bookmark", label: "Bookmark", group: "Navigation" },
  { key: "pin", label: "Pin", group: "Navigation" },
  { key: "link", label: "Link", group: "Navigation" },
  { key: "externalLink", label: "External link", group: "Navigation" },
  { key: "arrowUpRight", label: "Arrow up-right", group: "Navigation" },
  { key: "bell", label: "Bell", group: "Navigation" },
  { key: "settings", label: "Settings", group: "Navigation" },
  { key: "helpCircle", label: "Help", group: "Navigation" },
  { key: "shield", label: "Shield", group: "Navigation" },
  // Earning
  { key: "zap", label: "Bolt", group: "Earning" },
  { key: "calendarCheck", label: "Calendar check", group: "Earning" },
  { key: "listTodo", label: "Task list", group: "Earning" },
  { key: "target", label: "Target", group: "Earning" },
  { key: "rocket", label: "Rocket", group: "Earning" },
  { key: "coins", label: "Coins", group: "Earning" },
  { key: "badgeDollar", label: "Dollar badge", group: "Earning" },
  { key: "dollar", label: "Dollar", group: "Earning" },
  { key: "gift", label: "Gift", group: "Earning" },
  { key: "ticket", label: "Ticket", group: "Earning" },
  { key: "trophy", label: "Trophy", group: "Earning" },
  { key: "award", label: "Award", group: "Earning" },
  { key: "medal", label: "Medal", group: "Earning" },
  { key: "crown", label: "Crown", group: "Earning" },
  { key: "star", label: "Star", group: "Earning" },
  { key: "sparkles", label: "Sparkles", group: "Earning" },
  { key: "flame", label: "Flame", group: "Earning" },
  { key: "percent", label: "Percent", group: "Earning" },
  { key: "clipboardPlus", label: "Clipboard +", group: "Earning" },
  // Play & learn
  { key: "gamepad", label: "Game", group: "Play & learn" },
  { key: "puzzle", label: "Puzzle", group: "Play & learn" },
  { key: "brain", label: "Brain", group: "Play & learn" },
  { key: "graduation", label: "Graduation", group: "Play & learn" },
  { key: "bookOpen", label: "Book", group: "Play & learn" },
  { key: "lightbulb", label: "Idea", group: "Play & learn" },
  { key: "playCircle", label: "Play", group: "Play & learn" },
  { key: "video", label: "Video", group: "Play & learn" },
  { key: "tv", label: "TV", group: "Play & learn" },
  { key: "music", label: "Music", group: "Play & learn" },
  { key: "headphones", label: "Headphones", group: "Play & learn" },
  { key: "camera", label: "Camera", group: "Play & learn" },
  { key: "image", label: "Image", group: "Play & learn" },
  // Money & shop
  { key: "wallet", label: "Wallet", group: "Money & shop" },
  { key: "creditCard", label: "Card", group: "Money & shop" },
  { key: "banknote", label: "Banknote", group: "Money & shop" },
  { key: "piggyBank", label: "Piggy bank", group: "Money & shop" },
  { key: "receipt", label: "Receipt", group: "Money & shop" },
  { key: "shopping", label: "Shopping bag", group: "Money & shop" },
  { key: "store", label: "Store", group: "Money & shop" },
  { key: "package", label: "Package", group: "Money & shop" },
  { key: "briefcase", label: "Briefcase", group: "Money & shop" },
  { key: "megaphone", label: "Megaphone", group: "Money & shop" },
  { key: "barChart", label: "Chart", group: "Money & shop" },
  // People
  { key: "users", label: "Users", group: "People" },
  { key: "user", label: "User", group: "People" },
  { key: "handshake", label: "Handshake", group: "People" },
  { key: "messageSquare", label: "Chat", group: "People" },
  { key: "heart", label: "Heart", group: "People" },
  { key: "share", label: "Share", group: "People" },
  { key: "hash", label: "Hashtag", group: "People" },
  { key: "newspaper", label: "News", group: "People" },
  { key: "globe", label: "Globe", group: "People" },
  { key: "mapPin", label: "Map pin", group: "People" },
  { key: "smartphone", label: "Phone", group: "People" },
  { key: "layers", label: "Layers", group: "People" },
  { key: "fileText", label: "Document", group: "People" },
] as const;

export type NavIconKey = (typeof NAV_ICON_OPTIONS)[number]["key"];

const KEY_SET: ReadonlySet<string> = new Set(NAV_ICON_OPTIONS.map((o) => o.key));

export function isNavIconKey(key: unknown): key is NavIconKey {
  return typeof key === "string" && KEY_SET.has(key);
}
