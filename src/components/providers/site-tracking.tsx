"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { isAdminPath, isPublicPath } from "@/lib/public-paths";
import { REACT_ATTR, type CodeTag } from "@/lib/custom-code";

/**
 * Third-party tracking tags (Google Analytics 4, Google Tag Manager, Google
 * Ads, Facebook / Meta Pixel, Pinterest Tag, TikTok Pixel) and the owner's
 * custom code, configured at /admin/seo.
 *
 *  - Never on /admin: staff activity is not marketing data.
 *  - "Public pages only" scope keeps them off the signed-in app.
 *  - With the cookie banner on, analytics tags wait for "analytics" consent
 *    and ad/pixel tags for "marketing" consent — read from the banner's own
 *    storage, and re-checked the moment the visitor chooses.
 *  - SPA navigations fire a page view for the pixels that need it (GA4 tracks
 *    history changes itself).
 */

const CONSENT_KEY = "cookie_consent_v1";

type Consent = { analytics: boolean; marketing: boolean };

function readConsent(required: boolean): Consent {
  if (!required) return { analytics: true, marketing: true };
  try {
    const p = JSON.parse(localStorage.getItem(CONSENT_KEY) || "null") as Partial<Consent> | null;
    return { analytics: p?.analytics === true, marketing: p?.marketing === true };
  } catch {
    return { analytics: false, marketing: false };
  }
}

type Win = Window & {
  fbq?: (...a: unknown[]) => void;
  pintrk?: (...a: unknown[]) => void;
  ttq?: { page: () => void };
};

export function SiteTracking(props: {
  ga4: string;
  gtm: string;
  ads: string;
  fb: string;
  pinterest: string;
  tiktok: string;
  scope: string;
  requireConsent: boolean;
}) {
  const pathname = usePathname() ?? "/";
  const [consent, setConsent] = useState<Consent>({ analytics: false, marketing: false });
  const first = useRef(true);

  useEffect(() => {
    const sync = () => setConsent(readConsent(props.requireConsent));
    sync();
    window.addEventListener("eg-consent", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("eg-consent", sync);
      window.removeEventListener("storage", sync);
    };
  }, [props.requireConsent]);

  // Page views on client-side navigation (the first one is fired by the
  // snippets themselves).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const w = window as Win;
    try {
      w.fbq?.("track", "PageView");
      w.pintrk?.("page");
      w.ttq?.page();
    } catch {
      /* a tag's own error must never break navigation */
    }
  }, [pathname]);

  if (isAdminPath(pathname)) return null;
  if (props.scope === "public" && !isPublicPath(pathname)) return null;

  const gtagId = props.ga4 || props.ads;
  const analytics = consent.analytics;
  const marketing = consent.marketing;

  return (
    <>
      {gtagId && (analytics || marketing) && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gtagId}`} strategy="afterInteractive" />
          <Script id="eg-gtag" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());` +
              (props.ga4 && analytics ? `gtag('config','${props.ga4}');` : "") +
              (props.ads && marketing ? `gtag('config','${props.ads}');` : "")}
          </Script>
        </>
      )}
      {props.gtm && analytics && (
        <Script id="eg-gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${props.gtm}');`}
        </Script>
      )}
      {props.fb && marketing && (
        <Script id="eg-fbq" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${props.fb}');fbq('track','PageView');`}
        </Script>
      )}
      {props.pinterest && marketing && (
        <Script id="eg-pintrk" strategy="afterInteractive">
          {`!function(e){if(!window.pintrk){window.pintrk=function(){window.pintrk.queue.push(Array.prototype.slice.call(arguments))};var n=window.pintrk;n.queue=[],n.version="3.0";var t=document.createElement("script");t.async=!0,t.src=e;var r=document.getElementsByTagName("script")[0];r.parentNode.insertBefore(t,r)}}("https://s.pinimg.com/ct/core.js");pintrk('load','${props.pinterest}');pintrk('page');`}
        </Script>
      )}
      {props.tiktok && marketing && (
        <Script id="eg-ttq" strategy="afterInteractive">
          {`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${props.tiktok}');ttq.page();}(window,document,'ttq');`}
        </Script>
      )}
    </>
  );
}

/**
 * The owner's custom code (parsed by lib/custom-code). <meta> and <link> are
 * hoisted into <head> by React; scripts load after the page is interactive.
 * Custom code is treated as marketing: it waits for marketing consent when
 * the cookie banner is on.
 */
export function CustomCode({ tags, scope, requireConsent }: { tags: CodeTag[]; scope: string; requireConsent: boolean }) {
  const pathname = usePathname() ?? "/";
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const sync = () => setOk(readConsent(requireConsent).marketing);
    sync();
    window.addEventListener("eg-consent", sync);
    return () => window.removeEventListener("eg-consent", sync);
  }, [requireConsent]);

  if (!tags.length || isAdminPath(pathname)) return null;
  if (scope === "public" && !isPublicPath(pathname)) return null;

  const props = (attrs: CodeTag["attrs"]) =>
    Object.fromEntries(Object.entries(attrs).map(([k, v]) => [REACT_ATTR[k] ?? k, v]));

  return (
    <>
      {tags.map((t, i) => {
        const key = `eg-cc-${i}`;
        if (t.tag === "meta") return <meta key={key} {...props(t.attrs)} />;
        if (t.tag === "link") return <link key={key} {...props(t.attrs)} />;
        if (t.tag === "style") return <style key={key} dangerouslySetInnerHTML={{ __html: t.content }} />;
        if (t.tag === "noscript") return <noscript key={key} dangerouslySetInnerHTML={{ __html: t.content }} />;
        // scripts: only after consent
        if (!ok) return null;
        const { src, ...rest } = props(t.attrs) as Record<string, string | true>;
        return typeof src === "string" ? (
          <Script key={key} id={key} src={src} strategy="afterInteractive" {...(rest as object)} />
        ) : (
          <Script key={key} id={key} strategy="afterInteractive" {...(rest as object)}>
            {t.content}
          </Script>
        );
      })}
    </>
  );
}
