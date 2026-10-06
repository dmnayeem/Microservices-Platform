/**
 * The ad-network registry — every third-party network an admin can put into an
 * ad space, and what each one needs from the page.
 *
 * One table answers four questions that used to be answered nowhere:
 *
 *  - **Where may it run?** `kinds` says whether the network's code is an in-slot
 *    unit (`BANNER_IFRAME`), a native/recommendation widget (`NATIVE_WIDGET`), or
 *    a page-level script that needs the top window (`PAGE_SCRIPT` — popunder,
 *    social bar, push, in-page push, vignette, interstitial).
 *  - **What does the browser need to allow?** `domains` feeds the CSP in
 *    `next.config.ts`, the per-frame CSP in `/api/ads/frame/[id]`, and the
 *    `<link rel=preconnect>` hints. The first entry is the primary host.
 *  - **What goes in ads.txt?** `adsTxt` is a template; `{pub}` is replaced with
 *    the publisher id the owner enters in /admin/ads/networks.
 *  - **Is it safe on a page that pays the user?** `google` networks are locked
 *    off incentivised pages in code; every other network defaults off there and
 *    the owner may switch it on per network.
 *
 * CLIENT-SAFE and IMPORT-FREE on purpose: `next.config.ts` imports this file by
 * relative path to build the CSP, and the config loader does not resolve `@/`.
 */

export type NetworkKind = "BANNER_IFRAME" | "NATIVE_WIDGET" | "PAGE_SCRIPT";

export interface AdNetworkDef {
  id: string;
  name: string;
  kinds: NetworkKind[];
  /** Script / frame hosts. First = primary (preconnect). */
  domains: string[];
  /**
   * The network loads from rotating / unlisted domains, so a domain allowlist
   * would break it. CSP for these falls back to `https:`.
   */
  dynamicDomains?: boolean;
  /** ads.txt line template; `{pub}` = publisher id. Null = network has none. */
  adsTxt: string | null;
  /** Label for the publisher-id field in the network settings screen. */
  publisherIdLabel: string;
  /**
   * Google inventory (AdSense / Ad Manager). Rendered in-page by
   * `NetworkAdSlot`, never in a frame, and NEVER allowed on incentivised pages —
   * the toggle is locked off in the UI and ignored on the server.
   */
  google?: boolean;
  /**
   * Its page-level formats (popunder, push prompt, vignette, redirect) break
   * Google's page policies. A PAGE_SCRIPT ad from such a network is skipped on
   * any page that also loads AdSense / Ad Manager, unless the owner explicitly
   * allows it in the network settings.
   */
  conflictsWithGoogle?: boolean;
  /** Mostly adult demand — enabling it next to AdSense is an account risk. */
  adult?: boolean;
  notes: string;
}

const GOOGLE_ADS_TXT = "google.com, {pub}, DIRECT, f08c47fec0942fa0";

export const AD_NETWORKS: readonly AdNetworkDef[] = [
  {
    id: "adsense",
    name: "Google AdSense",
    kinds: ["BANNER_IFRAME"],
    domains: [
      "pagead2.googlesyndication.com",
      "googleads.g.doubleclick.net",
      "tpc.googlesyndication.com",
      "ep1.adtrafficquality.google",
      "ep2.adtrafficquality.google",
      "www.google.com",
      "fundingchoicesmessages.google.com",
    ],
    adsTxt: GOOGLE_ADS_TXT,
    publisherIdLabel: "Publisher id (ca-pub-…)",
    google: true,
    notes:
      "Set the publisher id in Monetization. Never runs on paid pages. In the AdSense console, exclude the paid-page URLs from Auto ads (see the list on this screen).",
  },
  {
    id: "gam",
    name: "Google Ad Manager",
    kinds: ["BANNER_IFRAME"],
    domains: [
      "securepubads.g.doubleclick.net",
      "pagead2.googlesyndication.com",
      "tpc.googlesyndication.com",
      "googleads.g.doubleclick.net",
    ],
    adsTxt: GOOGLE_ADS_TXT,
    publisherIdLabel: "Network code",
    google: true,
    notes: "Set the network code in Monetization. Never runs on paid pages.",
  },
  {
    id: "adsterra",
    name: "Adsterra",
    kinds: ["BANNER_IFRAME", "NATIVE_WIDGET", "PAGE_SCRIPT"],
    domains: ["www.highperformanceformat.com", "www.profitablecpmrate.com"],
    dynamicDomains: true,
    adsTxt: null,
    publisherIdLabel: "Publisher id",
    conflictsWithGoogle: true,
    notes:
      "Banners / native banners go in a slot. Popunder and Social Bar are PAGE_SCRIPT ads. Domains rotate.",
  },
  {
    id: "monetag",
    name: "Monetag",
    kinds: ["BANNER_IFRAME", "PAGE_SCRIPT"],
    domains: ["alwingulla.com", "fpyf8.com"],
    dynamicDomains: true,
    adsTxt: null,
    publisherIdLabel: "Publisher id",
    conflictsWithGoogle: true,
    notes:
      "Vignette, in-page push and popunder are PAGE_SCRIPT ads. Push notifications need their own service worker file at the site root — not supported (RevType's sw.js owns that scope).",
  },
  {
    id: "propellerads",
    name: "PropellerAds",
    kinds: ["BANNER_IFRAME", "PAGE_SCRIPT"],
    domains: ["propellerads.com"],
    dynamicDomains: true,
    adsTxt: null,
    publisherIdLabel: "Publisher id",
    conflictsWithGoogle: true,
    notes: "Onclick / in-page push are PAGE_SCRIPT ads. Push subscription formats are not supported.",
  },
  {
    id: "hilltopads",
    name: "HilltopAds",
    kinds: ["BANNER_IFRAME", "PAGE_SCRIPT"],
    domains: ["hilltopads.net"],
    dynamicDomains: true,
    adsTxt: null,
    publisherIdLabel: "Publisher id",
    conflictsWithGoogle: true,
    notes: "Popunder / video slider are PAGE_SCRIPT ads.",
  },
  {
    id: "a-ads",
    name: "A-Ads",
    kinds: ["BANNER_IFRAME"],
    domains: ["ad.a-ads.com", "a-ads.com"],
    adsTxt: null,
    publisherIdLabel: "Ad unit id",
    notes: "Crypto ad network; its unit is an iframe, paste it as-is.",
  },
  {
    id: "medianet",
    name: "Media.net",
    kinds: ["BANNER_IFRAME", "NATIVE_WIDGET"],
    domains: ["contextual.media.net", "static.media.net"],
    adsTxt: "media.net, {pub}, DIRECT",
    publisherIdLabel: "Customer id (8CU…)",
    notes: "Contextual demand reads the page; inside a frame it sees the frame URL, so fill can be lower.",
  },
  {
    id: "infolinks",
    name: "Infolinks",
    kinds: ["PAGE_SCRIPT"],
    domains: ["resources.infolinks.com", "router.infolinks.com"],
    adsTxt: "infolinks.com, {pub}, DIRECT",
    publisherIdLabel: "Publisher id",
    notes: "In-text / in-frame formats are page-level. AdSense-compatible.",
  },
  {
    id: "mgid",
    name: "MGID",
    kinds: ["NATIVE_WIDGET", "BANNER_IFRAME"],
    domains: ["jsc.mgid.com", "servicer.mgid.com", "cdn.mgid.com"],
    adsTxt: "mgid.com, {pub}, DIRECT, d4c29acad76ce94f",
    publisherIdLabel: "Publisher id",
    notes: "Native widget — use the 'Responsive (native widget)' size.",
  },
  {
    id: "taboola",
    name: "Taboola",
    kinds: ["NATIVE_WIDGET"],
    domains: ["cdn.taboola.com", "trc.taboola.com"],
    adsTxt: "taboola.com, {pub}, DIRECT, c228e6794e811952",
    publisherIdLabel: "Publisher id",
    notes: "Needs AD_FRAME_ORIGIN (its loader uses storage); reports the frame URL as the page.",
  },
  {
    id: "outbrain",
    name: "Outbrain",
    kinds: ["NATIVE_WIDGET"],
    domains: ["widgets.outbrain.com", "odb.outbrain.com"],
    adsTxt: "outbrain.com, {pub}, DIRECT",
    publisherIdLabel: "Publisher id",
    notes: "Needs AD_FRAME_ORIGIN (its loader uses storage).",
  },
  {
    id: "revcontent",
    name: "Revcontent",
    kinds: ["NATIVE_WIDGET"],
    domains: ["assets.revcontent.com", "trends.revcontent.com"],
    adsTxt: "revcontent.com, {pub}, DIRECT",
    publisherIdLabel: "Publisher id",
    notes: "Native widget — use the 'Responsive (native widget)' size.",
  },
  {
    id: "clickadu",
    name: "Clickadu",
    kinds: ["BANNER_IFRAME", "PAGE_SCRIPT"],
    domains: ["clickadu.com"],
    dynamicDomains: true,
    adsTxt: null,
    publisherIdLabel: "Publisher id",
    conflictsWithGoogle: true,
    notes: "Popunder / in-page push are PAGE_SCRIPT ads.",
  },
  {
    id: "popads",
    name: "PopAds",
    kinds: ["PAGE_SCRIPT"],
    domains: ["c1.popads.net", "c2.popads.net"],
    dynamicDomains: true,
    adsTxt: null,
    publisherIdLabel: "Site id",
    conflictsWithGoogle: true,
    notes: "Popunder only.",
  },
  {
    id: "popcash",
    name: "PopCash",
    kinds: ["PAGE_SCRIPT"],
    domains: ["cdn.popcash.net", "dcba.popcash.net"],
    dynamicDomains: true,
    adsTxt: null,
    publisherIdLabel: "Site id",
    conflictsWithGoogle: true,
    notes: "Popunder only.",
  },
  {
    id: "adcash",
    name: "Adcash",
    kinds: ["BANNER_IFRAME", "PAGE_SCRIPT"],
    domains: ["adcash.com"],
    dynamicDomains: true,
    adsTxt: null,
    publisherIdLabel: "Publisher id",
    conflictsWithGoogle: true,
    notes: "Autotag / popunder / interstitial are PAGE_SCRIPT ads.",
  },
  {
    id: "evadav",
    name: "EvaDav",
    kinds: ["PAGE_SCRIPT"],
    domains: ["evadav.com"],
    dynamicDomains: true,
    adsTxt: null,
    publisherIdLabel: "Publisher id",
    conflictsWithGoogle: true,
    notes: "In-page push works; browser-push needs a service worker and is not supported.",
  },
  {
    id: "richads",
    name: "RichAds",
    kinds: ["PAGE_SCRIPT"],
    domains: ["richads.com"],
    dynamicDomains: true,
    adsTxt: null,
    publisherIdLabel: "Publisher id",
    conflictsWithGoogle: true,
    notes: "In-page push / popunder. Browser-push is not supported.",
  },
  {
    id: "galaksion",
    name: "Galaksion",
    kinds: ["PAGE_SCRIPT"],
    domains: ["galaksion.com"],
    dynamicDomains: true,
    adsTxt: null,
    publisherIdLabel: "Publisher id",
    conflictsWithGoogle: true,
    notes: "Popunder / in-page push.",
  },
  {
    id: "coinzilla",
    name: "Coinzilla",
    kinds: ["BANNER_IFRAME", "PAGE_SCRIPT"],
    domains: ["coinzillatag.com", "request-global.czilladx.com"],
    adsTxt: null,
    publisherIdLabel: "Zone / publisher id",
    conflictsWithGoogle: true,
    notes: "Crypto demand. Banners in a slot; pop / sticky are PAGE_SCRIPT ads.",
  },
  {
    id: "bitmedia",
    name: "Bitmedia",
    kinds: ["BANNER_IFRAME", "NATIVE_WIDGET"],
    domains: ["bitmedia.io"],
    dynamicDomains: true,
    adsTxt: null,
    publisherIdLabel: "Publisher id",
    notes: "Crypto demand.",
  },
  {
    id: "admaven",
    name: "AdMaven",
    kinds: ["PAGE_SCRIPT", "BANNER_IFRAME"],
    domains: ["ad-maven.com"],
    dynamicDomains: true,
    adsTxt: null,
    publisherIdLabel: "Publisher id",
    conflictsWithGoogle: true,
    notes: "Popunder / push.",
  },
  {
    id: "exoclick",
    name: "ExoClick",
    kinds: ["BANNER_IFRAME", "NATIVE_WIDGET", "PAGE_SCRIPT"],
    domains: ["a.magsrv.com", "s.magsrv.com", "syndication.exoclick.com"],
    adsTxt: "exoclick.com, {pub}, DIRECT",
    publisherIdLabel: "Publisher id",
    conflictsWithGoogle: true,
    adult: true,
    notes: "Mostly adult demand — use mainstream-only zones. An adult creative next to AdSense risks the account.",
  },
  {
    id: "trafficstars",
    name: "TrafficStars",
    kinds: ["BANNER_IFRAME", "PAGE_SCRIPT"],
    domains: ["cdn.tsyndicate.com"],
    dynamicDomains: true,
    adsTxt: null,
    publisherIdLabel: "Publisher id",
    conflictsWithGoogle: true,
    adult: true,
    notes: "Mostly adult demand — mainstream zones only.",
  },
  {
    id: "bidvertiser",
    name: "BidVertiser",
    kinds: ["BANNER_IFRAME", "PAGE_SCRIPT"],
    domains: ["bdv.bidvertiser.com"],
    dynamicDomains: true,
    adsTxt: "bidvertiser.com, {pub}, DIRECT",
    publisherIdLabel: "Publisher id",
    conflictsWithGoogle: true,
    notes: "Banners in a slot; pop / push are PAGE_SCRIPT ads.",
  },
  {
    id: "ezoic",
    name: "Ezoic",
    kinds: ["PAGE_SCRIPT", "BANNER_IFRAME"],
    domains: ["www.ezojs.com", "go.ezodn.com", "g.ezoic.net"],
    adsTxt: null,
    publisherIdLabel: "Site id",
    notes:
      "Ezoic expects its header script site-wide plus placeholders, and manages ads.txt itself (redirect). Its placeholders cannot live inside a frame.",
  },
  {
    id: "custom",
    name: "Custom / other",
    kinds: ["BANNER_IFRAME", "NATIVE_WIDGET", "PAGE_SCRIPT"],
    domains: [],
    dynamicDomains: true,
    adsTxt: null,
    publisherIdLabel: "Publisher id (optional)",
    notes: "Any other network. Paste its ads.txt lines in the custom box.",
  },
];

const BY_ID = new Map(AD_NETWORKS.map((n) => [n.id, n]));

export function getAdNetwork(id: string | null | undefined): AdNetworkDef | null {
  if (!id) return null;
  return BY_ID.get(id) ?? null;
}

export function isGoogleNetworkId(id: string | null | undefined): boolean {
  return !!getAdNetwork(id)?.google;
}

/** Networks an admin can attach to an HTML ad (Google is configured as ADSENSE/GAM types). */
export const HTML_AD_NETWORKS = AD_NETWORKS.filter((n) => !n.google);

/** Every https origin a registry network may load from — for the static CSP. */
export function allRegistryOrigins(): string[] {
  const out = new Set<string>();
  for (const n of AD_NETWORKS) {
    for (const d of n.domains) {
      out.add(`https://${d}`);
      // Most networks serve from sibling subdomains of the primary host.
      const parts = d.split(".");
      if (parts.length >= 2) out.add(`https://*.${parts.slice(-2).join(".")}`);
    }
  }
  return [...out].sort();
}

/** Persisted per-network settings (SystemSetting `ads.networks`). */
export interface NetworkSettingsEntry {
  enabled: boolean;
  publisherId: string;
  /** May this network's ads run on incentivised (paid) pages? Google: always false. */
  allowOnPaid: boolean;
  /** Extra ads.txt lines the network gave the owner (one per line). */
  adsTxt: string;
}

export interface NetworkSettings {
  networks: Record<string, NetworkSettingsEntry>;
  /**
   * Run PAGE_SCRIPT ads from `conflictsWithGoogle` networks on pages that also
   * load AdSense / Ad Manager. Off by default — a popunder next to AdSense is a
   * policy breach.
   */
  pageScriptsWithGoogle: boolean;
}

export const EMPTY_NETWORK_ENTRY: NetworkSettingsEntry = {
  enabled: false,
  publisherId: "",
  allowOnPaid: false,
  adsTxt: "",
};

/** Normalise whatever is stored into a complete, safe settings object. */
export function normalizeNetworkSettings(raw: unknown): NetworkSettings {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<NetworkSettings>;
  const nets = (src.networks && typeof src.networks === "object" ? src.networks : {}) as Record<
    string,
    Partial<NetworkSettingsEntry>
  >;
  const networks: Record<string, NetworkSettingsEntry> = {};
  for (const n of AD_NETWORKS) {
    const e = nets[n.id] ?? {};
    networks[n.id] = {
      enabled: e.enabled === true,
      publisherId: typeof e.publisherId === "string" ? e.publisherId.trim().slice(0, 200) : "",
      // Google may never be allowed on paid pages, whatever is stored.
      allowOnPaid: n.google ? false : e.allowOnPaid === true,
      adsTxt: typeof e.adsTxt === "string" ? e.adsTxt.slice(0, 20_000) : "",
    };
  }
  return { networks, pageScriptsWithGoogle: src.pageScriptsWithGoogle === true };
}

/**
 * May an ad from `networkId` run on an incentivised (paid) surface?
 *
 * - Google: never.
 * - No network (own / direct-sold HTML, LOCAL creatives): yes — that is the
 *   inventory paid spaces exist for.
 * - Any other network: only when the owner switched `allowOnPaid` on for it.
 */
export function networkAllowedOnPaid(
  networkId: string | null | undefined,
  settings: NetworkSettings | null
): boolean {
  if (!networkId) return true;
  const def = getAdNetwork(networkId);
  if (!def) return false;
  if (def.google) return false;
  return settings?.networks[networkId]?.allowOnPaid === true;
}

/** Fill `{pub}` in a network's ads.txt template; null when there is nothing to fill. */
export function adsTxtLineFor(def: AdNetworkDef, publisherId: string): string | null {
  if (!def.adsTxt) return null;
  const pub = publisherId.replace(/[^A-Za-z0-9_.-]/g, "").replace(/^ca-/, "");
  if (!pub) return null;
  return def.adsTxt.replace("{pub}", pub);
}
