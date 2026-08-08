import type { Metadata, Viewport } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
// Bengali (বাংলা) glyph coverage — the Latin faces above have none.
import "@fontsource/noto-sans-bengali/400.css";
import "@fontsource/noto-sans-bengali/500.css";
import "@fontsource/noto-sans-bengali/600.css";
import "@fontsource/noto-sans-bengali/700.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
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
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "EarnGPT - Earn Money Online",
    template: "%s | EarnGPT",
  },
  description: "Complete tasks, watch videos, and earn real money with EarnGPT. Join our community and start earning today!",
  keywords: ["earn money", "online earning", "tasks", "rewards", "cashout", "referral"],
  authors: [{ name: "EarnGPT Team" }],
  creator: "EarnGPT",
  publisher: "EarnGPT",
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
    url: "https://earngpt.app",
    siteName: "EarnGPT",
    title: "EarnGPT - Earn Money Online",
    description: "Complete tasks, watch videos, and earn real money with EarnGPT.",
  },
  twitter: {
    card: "summary_large_image",
    title: "EarnGPT - Earn Money Online",
    description: "Complete tasks, watch videos, and earn real money with EarnGPT.",
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0f" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const ui = await getUiToggles();
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        {/* Set the saved theme + accent before first paint so a reload never
            flashes the wrong theme/color. Resolves "system" via prefers-color-
            scheme. Runs synchronously before the body content paints. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var d=document.documentElement;var t=localStorage.getItem('earngpt-theme')||'dark';var r=t==='system'?(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):t;d.setAttribute('data-theme',r);var a=localStorage.getItem('earngpt-accent')||'indigo';d.setAttribute('data-accent',a);}catch(e){}`,
          }}
        />
        <ThemeProvider defaultTheme="dark" storageKey="earngpt-theme">
          {children}
          <PageViewTracker />
          <ServiceWorkerRegister />
          <SplashScreen />
          <CookieConsent enabled={ui.cookiesPopup} />
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
