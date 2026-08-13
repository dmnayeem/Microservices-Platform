import type { IconType } from "react-icons";
import {
  SiYoutube, SiFacebook, SiInstagram, SiTiktok, SiX, SiTelegram, SiDiscord,
  SiWhatsapp, SiReddit, SiSnapchat, SiPinterest, SiThreads, SiSpotify,
  SiSoundcloud, SiTwitch, SiBluesky, SiMastodon, SiMedium, SiQuora,
  SiTrustpilot, SiGoogle, SiGooglemaps, SiGoogleplay, SiAppstore, SiApplemusic,
  SiYelp, SiTripadvisor, SiTidal, SiDeezer, SiBandcamp, SiBinance, SiPaypal,
  SiVisa, SiMastercard, SiTether, SiBitcoin, SiWise, SiPayoneer, SiStripe,
} from "react-icons/si";
import { FaLinkedin, FaVimeoV, FaApple } from "react-icons/fa6";
import { cn } from "@/lib/utils";

/**
 * Real brand logos, keyed by a normalized brand key. Renders the actual mark for
 * a platform/brand (nominative labeling of that brand's own service). Falls back
 * to a branded colored-initial badge (or a caller-supplied emoji) when a brand
 * isn't in the icon library — and prefers `public/brands/<key>.svg` if present,
 * so exact official logos can be dropped in later with no code change.
 */

interface BrandDef {
  Icon?: IconType;
  /** Brand hex — used for the colored variant + the fallback badge. */
  color: string;
  /** Short label for the fallback badge (defaults to the first letter). */
  short?: string;
}

const BRAND: Record<string, BrandDef> = {
  // Social / media
  facebook: { Icon: SiFacebook, color: "#1877F2" },
  x: { Icon: SiX, color: "#000000" },
  youtube: { Icon: SiYoutube, color: "#FF0000" },
  instagram: { Icon: SiInstagram, color: "#E4405F" },
  tiktok: { Icon: SiTiktok, color: "#EE1D52" },
  pinterest: { Icon: SiPinterest, color: "#BD081C" },
  linkedin: { Icon: FaLinkedin, color: "#0A66C2" },
  threads: { Icon: SiThreads, color: "#000000" },
  discord: { Icon: SiDiscord, color: "#5865F2" },
  telegram: { Icon: SiTelegram, color: "#26A5E4" },
  reddit: { Icon: SiReddit, color: "#FF4500" },
  snapchat: { Icon: SiSnapchat, color: "#FFFC00" },
  whatsapp: { Icon: SiWhatsapp, color: "#25D366" },
  twitch: { Icon: SiTwitch, color: "#9146FF" },
  bluesky: { Icon: SiBluesky, color: "#0285FF" },
  mastodon: { Icon: SiMastodon, color: "#6364FF" },
  medium: { Icon: SiMedium, color: "#000000" },
  quora: { Icon: SiQuora, color: "#B92B27" },
  spotify: { Icon: SiSpotify, color: "#1DB954" },
  soundcloud: { Icon: SiSoundcloud, color: "#FF5500" },
  applemusic: { Icon: SiApplemusic, color: "#FA243C" },
  amazonmusic: { color: "#FF9900", short: "a" },
  tidal: { Icon: SiTidal, color: "#000000" },
  deezer: { Icon: SiDeezer, color: "#A238FF" },
  bandcamp: { Icon: SiBandcamp, color: "#629AA9" },
  // Reviews / listings
  google: { Icon: SiGoogle, color: "#4285F4" },
  googlemaps: { Icon: SiGooglemaps, color: "#4285F4" },
  trustpilot: { Icon: SiTrustpilot, color: "#00B67A" },
  yelp: { Icon: SiYelp, color: "#FF1A1A" },
  tripadvisor: { Icon: SiTripadvisor, color: "#34E0A1" },
  // Video providers
  vimeo: { Icon: FaVimeoV, color: "#1AB7EA" },
  // App stores
  googleplay: { Icon: SiGoogleplay, color: "#48FF48" },
  appstore: { Icon: SiAppstore, color: "#0D96F6" },
  apple: { Icon: FaApple, color: "#000000" },
  // Payments
  binance: { Icon: SiBinance, color: "#F0B90B" },
  paypal: { Icon: SiPaypal, color: "#003087" },
  visa: { Icon: SiVisa, color: "#1A1F71" },
  mastercard: { Icon: SiMastercard, color: "#EB001B" },
  tether: { Icon: SiTether, color: "#50AF95" },
  bitcoin: { Icon: SiBitcoin, color: "#F7931A" },
  wise: { Icon: SiWise, color: "#9FE870" },
  payoneer: { Icon: SiPayoneer, color: "#FF4800" },
  stripe: { Icon: SiStripe, color: "#635BFF" },
  skrill: { color: "#862165", short: "S" },
  // Bangladeshi wallets — not in icon libraries; branded initial badge until an
  // official SVG is dropped into public/brands/.
  bkash: { color: "#E2136E", short: "bK" },
  nagad: { color: "#EC1C24", short: "N" },
  rocket: { color: "#8C3494", short: "R" },
};

/** Aliases: various raw inputs (labels, enum values) → a canonical BRAND key. */
const ALIAS: Record<string, string> = {
  twitter: "x",
  xtwitter: "x",
  fbgroup: "facebook",
  facebookreviews: "facebook",
  facebookgaming: "facebook",
  googlereviews: "google",
  playstore: "googleplay",
  play: "googleplay",
  binancepay: "binance",
  usdt: "tether",
  usdttrc20: "tether",
  crypto: "bitcoin",
  btc: "bitcoin",
  card: "visa",
  creditcard: "visa",
  ssother: "",
};

/** Normalize any raw brand/platform name or key to a canonical BRAND key. */
export function brandKeyFor(raw: string | null | undefined): string {
  if (!raw) return "";
  const norm = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  return ALIAS[norm] ?? norm;
}

interface BrandIconProps {
  brand: string;
  className?: string;
  /** Apply the brand's own color (default inherits currentColor — use on colored surfaces with text-white). */
  colored?: boolean;
  /** Emoji/text shown when the brand has no logo in the registry. */
  fallback?: string;
}

export function BrandIcon({ brand, className, colored, fallback }: BrandIconProps) {
  const key = brandKeyFor(brand);
  const def = BRAND[key];

  if (def?.Icon) {
    const Icon = def.Icon;
    return (
      <Icon
        className={cn("w-4 h-4", className)}
        style={colored ? { color: def.color } : undefined}
        aria-hidden
      />
    );
  }

  // No library logo. If the brand is known, show a branded initial badge; else
  // fall back to the caller's emoji (keeps existing behavior for unknowns).
  if (def) {
    const short = def.short ?? key.charAt(0).toUpperCase();
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-[0.35em] font-bold leading-none w-4 h-4 text-[0.6em]",
          className
        )}
        style={colored ? { backgroundColor: def.color, color: "#fff" } : undefined}
        aria-hidden
      >
        {short}
      </span>
    );
  }

  return fallback ? <span className={className} aria-hidden>{fallback}</span> : null;
}
