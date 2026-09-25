import type { Metadata, Viewport } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
// 800 — the display tier of the Obsidian Kinetic scale (`display-hero`).
// Without it the browser synthesises a fake bold from 700, which smears the
// large balance figures the design leans on.
import "@fontsource/plus-jakarta-sans/800.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
// Bengali (বাংলা) glyph coverage — the Latin faces above have none.
import "@fontsource/noto-sans-bengali/400.css";
import "@fontsource/noto-sans-bengali/500.css";
import "@fontsource/noto-sans-bengali/600.css";
import "@fontsource/noto-sans-bengali/700.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { NetworkScripts } from "@/components/providers/network-scripts";
import { getSetting } from "@/lib/system-settings";
import { Toaster } from "sonner";
import { CookieConsent } from "@/components/user/primitives/cookie-consent";
import { PushPermissionPrompt } from "@/components/user/primitives/push-permission-prompt";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { SplashScreen } from "@/components/pwa/splash-screen";
import { PwaInstallPrompt } from "@/components/pwa/pwa-install-prompt";
import { ConfirmHost } from "@/components/providers/confirm-host";
import { NotifyCenterHost } from "@/components/providers/notify-center-host";
import { RewardInterstitialHost } from "@/components/providers/reward-interstitial-host";
import { AdblockHost } from "@/components/providers/adblock-host";
import { PageViewTracker } from "@/components/analytics/page-view-tracker";
import { getUiToggles } from "@/lib/ui-toggles-server";
import { getLevelCurve } from "@/lib/level-curve-server";
import { kickScheduler } from "@/lib/scheduler/run";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://earngpt.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "EarnGPT - Earn Money Online",
    template: "%s | EarnGPT",
  },
  description: "Complete tasks, watch videos, and earn real money with EarnGPT. Join our community and start earning today!",
  keywords: [
    "earn money online",
    "make money online",
    "online earning",
    "paid tasks",
    "watch videos for money",
    "rewards",
    "cashout",
    "referral program",
    "affiliate program",
    "micro tasks",
    "surveys for money",
    "GPT site",
  ],
  authors: [{ name: "EarnGPT Team" }],
  creator: "EarnGPT",
  publisher: "EarnGPT",
  alternates: { canonical: "/" },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "EarnGPT",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "EarnGPT",
    title: "EarnGPT - Earn Money Online",
    description: "Complete tasks, watch videos, and earn real money with EarnGPT.",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "EarnGPT" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "EarnGPT - Earn Money Online",
    description: "Complete tasks, watch videos, and earn real money with EarnGPT.",
    images: ["/icon-512.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // Must match --app-page in globals.css. The phone paints the status bar and
  // the pull-to-refresh area with this, so a value that drifts from the page
  // shows as a band of a different colour above the content.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1713" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Google's certified CMP and our own cookie banner are two consent surfaces
  // for the same decision. With both on, the visitor is asked twice — and the
  // homegrown one is not TCF-certified, so it can never be the answer Google
  // reads. When the CMP is enabled it owns consent and ours stands down;
  // `src/lib/ad-consent.ts` keeps reading the stored preference either way, so
  // nothing regresses for non-EEA traffic.
  // The platform's own traffic is the scheduler. This registers the tick to run
  // AFTER this response is flushed (see `lib/scheduler/run`) — it awaits
  // nothing, it cannot throw, and nobody looking at a page ever waits for it.
  kickScheduler();

  const [ui, levelCurve, googleCmp] = await Promise.all([
    getUiToggles(),
    getLevelCurve(),
    getSetting<boolean>("ads.google_cmp_enabled", false),
  ]);
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        {/* Site-wide structured data (Organization + WebSite w/ SearchAction) —
            sitelinks search box, entity/E-E-A-T + GEO signals. */}
        <JsonLd
          data={[
            {
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "EarnGPT",
              url: SITE_URL,
              logo: `${SITE_URL}/icon-512.png`,
              description:
                "Complete tasks, watch videos, take surveys and courses, and earn real money with EarnGPT.",
            },
            {
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "EarnGPT",
              url: SITE_URL,
              potentialAction: {
                "@type": "SearchAction",
                target: `${SITE_URL}/marketplace?search={search_term_string}`,
                "query-input": "required name=search_term_string",
              },
            },
          ]}
        />
        {/* Set the theme + accent before first paint so a reload never flashes
            the wrong one. Resolves "system" via prefers-color-scheme. Runs
            synchronously, before the body content paints.

            The admin's two settings are baked in as literals rather than read
            from anywhere at runtime: this script runs before React, before any
            fetch, and before the provider mounts, so anything it cannot see
            synchronously would arrive a frame too late and show as a flash.
            When choice is off the stored preference is not even read, so a
            user who had picked light lands on the admin's theme immediately —
            not after a repaint. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var d=document.documentElement;var D=${JSON.stringify(
              ui.themeDefault
            )};var C=${ui.themeUserChoice};var t=C?(localStorage.getItem('earngpt-theme')||D):D;var r=t==='system'?(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):t;d.setAttribute('data-theme',r);var a=localStorage.getItem('earngpt-accent');if(a){d.setAttribute('data-accent',a);}}catch(e){}`,
          }}
        />
        {/* The level curve, before any app code runs.
            The bug this module family exists to kill was two curves
            disagreeing — the one that wrote `User.level` and the one that drew
            the progress bar — which pinned users at 100% forever. If the
            browser learned the admin's curve from a fetch, every first paint
            would draw the shipped one and then correct itself, which is the
            same disagreement with a shorter lifespan. So it is inlined, like
            the theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__EG_LEVEL_CURVE=${JSON.stringify(levelCurve)};`,
          }}
        />
        {/* Google's ad tags — one per page, and only when a publisher id is
            configured. Renders nothing at all until then. */}
        <NetworkScripts />
        <ThemeProvider
          defaultTheme={ui.themeDefault}
          storageKey="earngpt-theme"
          allowUserChoice={ui.themeUserChoice}
        >
          {children}
          <PageViewTracker />
          <ServiceWorkerRegister />
          <SplashScreen />
          <CookieConsent enabled={ui.cookiesPopup && !googleCmp} />
          <PushPermissionPrompt enabled={ui.notificationPopup} />
          <PwaInstallPrompt enabled={ui.pwaInstallPrompt} />
          <ConfirmHost />
          <NotifyCenterHost />
          <RewardInterstitialHost />
          <AdblockHost />
          <Toaster
            position="top-center"
            theme="dark"
            richColors
            closeButton
            toastOptions={{
              style: {
                background: "rgb(15 23 42)",
                border: "1px solid rgb(51 65 85)",
                color: "white",
                marginTop: "env(safe-area-inset-top)",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
