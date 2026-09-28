import type { MetadataRoute } from "next";
import { getSeoSettings } from "@/lib/seo-settings";
import { homeIconSource, homeIconUrl, maskableIconUrl } from "@/lib/brand-icons";

/**
 * The web-app manifest, built from /admin/seo so the name and the home-screen
 * icon follow the settings. It was a static public/manifest.json, which never
 * read them — an uploaded icon never reached anyone's home screen.
 *
 * `id` stays "/" so every existing install is the same app.
 */
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const s = await getSeoSettings().catch(() => null);
  const name = s?.["seo.site_name"] || "RevType";
  const custom = s ? homeIconSource(s) : null;
  const icons: MetadataRoute.Manifest["icons"] = custom && s
    ? [
        { src: homeIconUrl(s, 192), sizes: "192x192", type: "image/png", purpose: "any" },
        { src: homeIconUrl(s, 512), sizes: "512x512", type: "image/png", purpose: "any" },
        { src: maskableIconUrl(s), sizes: "512x512", type: "image/png", purpose: "maskable" },
      ]
    : [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ];
  const shortcut = (n: string, url: string) => ({ name: n, short_name: n, url, icons: [{ src: icons[0].src, sizes: "192x192" }] });
  return {
    id: "/",
    name: `${name} - Earn Money Online`,
    short_name: name,
    description: s?.["seo.org_description"] || `Complete tasks, watch videos, and earn real money with ${name}.`,
    lang: "en",
    dir: "ltr",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#08120d",
    theme_color: "#08120d",
    categories: ["finance", "productivity"],
    icons,
    shortcuts: [
      shortcut("Tasks", "/tasks"),
      shortcut("Wallet", "/wallet"),
      shortcut("Feed", "/social"),
      shortcut("Withdraw", "/withdrawal"),
    ],
  };
}
