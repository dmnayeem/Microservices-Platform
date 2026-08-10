// Server components shared by both marketing shells (homepage + (marketing) layout).
//
// The marketing surface has its OWN theme, isolated from the app dashboard theme:
// `data-mk-theme` on #mk-root drives the --mk-* CSS tokens (see globals.css). SSR
// renders the admin default; this pre-paint script corrects it to the visitor's
// saved choice (localStorage key `earngpt-landing-theme`) before first paint.

const MK_THEME_BOOT = `(function(){try{var el=document.getElementById('mk-root');if(!el)return;var t=localStorage.getItem('earngpt-landing-theme');if(t==='light'||t==='dark')el.setAttribute('data-mk-theme',t);}catch(e){}})();`;

/** Inline pre-paint script — render as the first child of #mk-root. */
export function MarketingThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: MK_THEME_BOOT }} />;
}

/** Animated background glow. Only rendered when admin has animations enabled;
 *  the pulse itself is gated by `data-mk-anim="on"` in globals.css. */
export function MarketingBlobs() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <div className="mk-blob absolute top-[-10%] left-[-10%] w-96 h-96 rounded-full bg-(--mk-blob-a) blur-3xl" />
      <div className="mk-blob mk-blob-delay-1 absolute bottom-[-10%] right-[-10%] w-96 h-96 rounded-full bg-(--mk-blob-b) blur-3xl" />
      <div className="mk-blob mk-blob-delay-2 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-(--mk-blob-c) blur-3xl" />
    </div>
  );
}
