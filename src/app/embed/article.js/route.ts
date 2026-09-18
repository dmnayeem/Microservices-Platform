import { NextRequest } from "next/server";

/**
 * GET /embed/article.js
 *
 * Cross-domain article-task embed script (v3 — inline text mode).
 *
 *   <script src="https://OUR_ORIGIN/embed/article.js"
 *     data-task="<taskId>" data-page="N" async></script>
 *
 * Behavior:
 *   - Self-detects via `document.currentScript` (fallback: last
 *     `[data-task]` script tag).
 *   - Reads `?eg=<token>` from the page URL. If missing → silent (no UI).
 *   - Fetches embed-config to get the list of clickable text items for
 *     this page + theme + next URL.
 *   - Inserts each text item into the article body at evenly spaced
 *     vertical positions (one per content section). Each item is a small
 *     ad-style clickable badge styled with the admin's per-text color +
 *     optional highlight bg.
 *   - User clicks each → fades out, reports progress.
 *   - All items clicked on a non-final page → wait briefly → redirect to
 *     the next page URL.
 *   - All items clicked on the final page → render a final "Generate Key"
 *     CTA → click → atomic claim → redirect to OUR_ORIGIN/article-tasks/
 *     complete?... for auto-submit.
 */
/**
 * Where to send the reader, as opposed to where to send our own fetches.
 *
 * API calls must go back to whoever served this script — that is the origin
 * holding the session and answering CORS, and it is what keeps a local test
 * talking to a local server. But the "Submit on EarnGPT" link is a place a
 * person goes to log in, so it has to be the site's real address. Two things
 * make the request's own origin wrong for that: an admin testing on localhost
 * hands the reader a localhost link, and behind a proxy or CDN `nextUrl.origin`
 * can be an internal hostname the public has never heard of.
 *
 * Only an absolute http(s) URL is accepted, and a local one is ignored, so a
 * half-configured env cannot produce a worse link than the fallback.
 */
function publicOrigin(fallback: string): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  if (!configured) return fallback;
  try {
    const u = new URL(configured);
    if (u.protocol !== "http:" && u.protocol !== "https:") return fallback;
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(u.hostname)) return fallback;
    return u.origin;
  } catch {
    return fallback;
  }
}

export function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const script = buildScript(origin, publicOrigin(origin));
  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, must-revalidate",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function buildScript(origin: string, appOrigin: string): string {
  return `/* EarnGPT article-task embed v3 — built ${new Date().toISOString()} */
(function() {
  'use strict';
  var ORIGIN = ${JSON.stringify(origin)};
  // Our own fetches use ORIGIN; anything the reader clicks uses APP_ORIGIN.
  var APP_ORIGIN = ${JSON.stringify(appOrigin)};
  var STYLE_ID = '__eg_at_style__';
  var ITEM_CLASS = '__eg_at_item';
  var FINAL_CLASS = '__eg_at_final_cta';
  var DEFAULT_THEME = { textColor: '#0f172a', bgColor: '#0f172a', accentColor: '#6366f1' };

  // Self-script detection.
  var selfTag = document.currentScript;
  if (!selfTag || !selfTag.getAttribute('data-task')) {
    var all = document.querySelectorAll('script[data-task]');
    selfTag = all.length ? all[all.length - 1] : null;
  }
  if (!selfTag) return;
  var taskId = selfTag.getAttribute('data-task');
  var pageStr = selfTag.getAttribute('data-page') || '1';
  var pageNumber = parseInt(pageStr, 10) || 1;
  var token = getQueryParam('eg');

  // Silent fail if essentials missing — random visitors see the article unchanged.
  if (!taskId || !token) return;

  var state = {
    config: null,
    items: [],          // [{ node, popupIndex, clicked }]
    clicked: 0,
    busy: false,
    // ── v3 engagement state ───────────────────────────────────────────
    dwellMs: 0,
    lastInputAt: Date.now(),
    adZones: [],        // forbidden rects (top/bottom in document coords)
    scrollPercent: 0,
    dwellTickHandle: null,
    // ── v3.1 sequential reveal state ─────────────────────────────────
    nextPopupIndex: 0,  // index of next popup to show
    activeNode: null,   // the popup currently on-screen (or null)
    activeAnchor: null, // (legacy) anchor element used for the active popup
    activeZone: -1,     // v3.3: zone (0/1/2) of the active popup
    lastAnchorEl: null, // (legacy) last anchor used
    lastZone: -1,       // v3.3: zone of the last clicked popup
    lastClickAtMs: 0    // dwellMs value when the last popup was clicked
  };

  // Fetch the embed-config and render once DOM is ready.
  ready(function() {
    fetch(ORIGIN + '/api/article-tasks/' + encodeURIComponent(taskId) +
          '/embed-config?page=' + pageNumber + '&token=' + encodeURIComponent(token))
      .then(function(r) {
        return r.json().then(function(d) { return { ok: r.ok, status: r.status, data: d }; });
      })
      .then(function(res) {
        if (!res.ok) return; // silent on config error to keep the page clean
        state.config = res.data;
        state.clicked = (res.data.progress && res.data.progress.popupsCompleted) || 0;
        injectStyles(res.data.theme || DEFAULT_THEME);
        startEngagementTracking();
        renderItems();
      })
      .catch(function() { /* silent on network failure */ });
  });

  // ── v3 engagement tracking ─────────────────────────────────────────────

  function startEngagementTracking() {
    var cfg = state.config || {};
    var eng = cfg.engagement || {};
    var mode = eng.mode || 'natural';
    if (mode === 'fast') {
      // No gating in fast mode — but still track dwell for reveal animations.
      state.dwellMs = eng.minDwellSeconds * 1000 + 1;
    }

    // Dwell counter (1Hz). Pauses when tab hidden or user idle 30s.
    state.dwellTickHandle = setInterval(function() {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - state.lastInputAt > 30000) return;
      state.dwellMs += 1000;
      // When dwell crosses the threshold, reveal-attempt every dormant item.
      schedulePopupReveal();
    }, 1000);

    // Touch/keyboard/mouse/scroll all count as "alive" signal.
    var inputEvents = ['scroll', 'mousemove', 'touchstart', 'keydown', 'click'];
    for (var i = 0; i < inputEvents.length; i++) {
      window.addEventListener(inputEvents[i], onUserInput, { passive: true });
    }

    // Throttled scroll listener for waypoint detection + reveal.
    var lastScrollAt = 0;
    window.addEventListener('scroll', function() {
      var now = Date.now();
      if (now - lastScrollAt < 150) return;
      lastScrollAt = now;
      state.scrollPercent = computeScrollPercent();
      schedulePopupReveal();
    }, { passive: true });

    // Detect ads now and again after window.load (iframes load late).
    state.adZones = detectAdZones();
    if (document.readyState !== 'complete') {
      window.addEventListener('load', function() {
        setTimeout(function() { state.adZones = detectAdZones(); }, 200);
      });
    }
    setTimeout(function() { state.adZones = detectAdZones(); }, 2200);
  }

  function onUserInput() {
    state.lastInputAt = Date.now();
  }

  function computeScrollPercent() {
    var docH = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
    var winH = window.innerHeight || document.documentElement.clientHeight;
    var scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    var maxScroll = Math.max(1, docH - winH);
    return Math.min(100, (scrollY / maxScroll) * 100);
  }

  function detectAdZones() {
    var selectors = [
      'ins.adsbygoogle',
      'iframe[src*="googlesyndication"]',
      'iframe[src*="googleads"]',
      'iframe[src*="doubleclick"]',
      '[id^="div-gpt-ad"]',
      '.advertisement', '.adslot', '.ad-slot',
      '[data-ad-slot]', '[data-ad]'
    ];
    var nodes;
    try {
      nodes = document.querySelectorAll(selectors.join(','));
    } catch (e) {
      return [];
    }
    var zones = [];
    var scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    for (var i = 0; i < nodes.length; i++) {
      var r = nodes[i].getBoundingClientRect();
      if (r.width > 50 && r.height > 50) {
        zones.push({
          top: r.top + scrollY - 10,
          bottom: r.bottom + scrollY + 10
        });
      }
    }
    return zones;
  }

  function isInsideAdZone(absoluteTop) {
    for (var i = 0; i < state.adZones.length; i++) {
      var z = state.adZones[i];
      if (absoluteTop >= z.top && absoluteTop <= z.bottom) return true;
    }
    return false;
  }

  // ── Rendering (v3.1 — sequential reveal) ───────────────────────────────
  //
  // Only ONE popup is on-screen at a time. The next popup appears after the
  // user clicks the current one AND the configured "intervalSeconds" of
  // dwell time has elapsed. Each new popup picks a FRESH random anchor
  // (avoiding the previous one and any ad zones) so it appears in a
  // different place every click — no fixed position.

  function renderItems() {
    var cfg = state.config;
    var popups = (cfg && cfg.popups) || [];
    var total = popups.length;
    if (total === 0) {
      onAllDone();
      return;
    }
    // Already-clicked items shouldn't re-appear after a refresh.
    state.nextPopupIndex = Math.min(state.clicked, total);
    state.lastClickAtMs = state.dwellMs; // baseline for the first reveal
    state.lastAnchorEl = null;
    // Begin watching for the first popup's reveal time.
    schedulePopupReveal();
  }

  /**
   * Decide if the next popup is ready to appear, and if so, render it
   * at its admin-set (or random) position. Called whenever the dwell
   * counter ticks. Cheap idempotent check.
   */
  function schedulePopupReveal() {
    var cfg = state.config;
    if (!cfg) return;
    var popups = (cfg && cfg.popups) || [];
    var total = popups.length;
    var idx = state.nextPopupIndex || 0;
    if (idx >= total) return;
    // Don't show two at once.
    if (state.activeNode && state.activeNode.parentNode) return;

    // v3.5 — per-popup delay. The popup's own delaySeconds overrides the
    // global popupInterval. First popup measures from page load; subsequent
    // popups measure from the previous click.
    var item = popups[idx];
    var timing = cfg.popupTiming || { firstDelaySeconds: 5, intervalSeconds: 15 };
    var fallback = (idx === 0)
      ? (timing.firstDelaySeconds || 0)
      : (timing.intervalSeconds || 0);
    var perPopupDelay =
      item && typeof item.delaySeconds === "number" && item.delaySeconds >= 0
        ? item.delaySeconds
        : fallback;

    var baseSec = (idx === 0) ? 0 : (state.lastClickAtMs / 1000);
    var requiredDwell = baseSec + perPopupDelay;
    var elapsedSec = state.dwellMs / 1000;
    if (elapsedSec < requiredDwell) return;

    showNextPopup(idx);
  }

  function showNextPopup(idx) {
    var cfg = state.config;
    var popups = cfg.popups || [];
    var total = popups.length;
    var eng = cfg.engagement || {};

    // Use the per-user popupOrder (server-seeded) so user A and user B
    // see different texts first. If missing, just use natural order.
    var order = (eng.popupOrder && eng.popupOrder.length === total)
      ? eng.popupOrder
      : popups.map(function(_, i) { return i; });
    var popupIdx = order[idx] != null ? order[idx] : idx;
    var item = popups[popupIdx] || popups[idx];
    if (!item) return;

    // v3.5 — admin-set position dropdown ("top" / "quarter" / "middle" /
    // "three-quarter" / "bottom" / "random"). "random" picks a slot
    // different from the last one to keep variation natural.
    var requestedPos = (item && item.position) || "random";
    var place = computePosition(requestedPos, state.lastZone, state.adZones);

    var node = buildItem(item, idx, total, popupIdx);
    node.classList.add('__eg_at_pos_inline');
    // Inline "!important" so the host site's CSS can't override.
    node.style.setProperty('position', 'absolute', 'important');
    node.style.setProperty('top', place.top + 'px', 'important');
    node.style.setProperty('left', place.left + 'px', 'important');
    node.style.setProperty('transform', 'translateX(-50%)', 'important');
    node.style.setProperty('z-index', '2147483640', 'important');
    node.style.setProperty('opacity', '1', 'important');
    node.style.setProperty('pointer-events', 'auto', 'important');
    node.style.setProperty('margin', '0', 'important');
    node.style.setProperty('float', 'none', 'important');
    node.style.transition = 'opacity 280ms ease';

    if (document.body) {
      document.body.appendChild(node);
    } else {
      var articleRoot = getArticleRoot();
      articleRoot.appendChild(node);
    }

    // Prove it is actually reachable, and rescue it if not.
    //
    // The badge is absolutely positioned at a computed pixel depth on a page we
    // do not control. A host site can defeat that in ways we cannot predict
    // from here: \`body { overflow: hidden }\`, a transform on an ancestor (which
    // makes it the containing block, so our document-space \`top\` means
    // something else entirely), a scroll container that is not the window, or a
    // document that grew after we measured because images loaded late — and the
    // badge lands past the end of the content.
    //
    // Every one of those looks identical to the reader: the article, no popup,
    // and no way to finish the task. So after the browser has laid it out, we
    // check it has a real box inside the document, and if it does not, we pin
    // it to the viewport instead. A badge in the corner is not the intended
    // design; a badge nobody can reach is a broken task.
    requestAnimationFrame(function() {
      if (!node.parentNode) return;
      var r = node.getBoundingClientRect();
      var docH = Math.max(
        document.body ? document.body.scrollHeight : 0,
        document.documentElement ? document.documentElement.scrollHeight : 0
      );
      var absTop = r.top + (window.pageYOffset || 0);
      var invisible = r.width < 4 || r.height < 4;
      var pastEnd = docH > 0 && absTop > docH;

      // Keep it on screen horizontally.
      //
      // \`left\` is the badge's CENTRE, because of translateX(-50%), and that
      // centre is jittered across the middle 40% of the article. On a phone
      // that is enough to push a wide badge past the right edge, where it is
      // clipped and cannot be tapped. The real width is only knowable after
      // layout, which is here, so the correction belongs here too.
      if (!invisible) {
        var vw = document.documentElement
          ? document.documentElement.clientWidth
          : window.innerWidth;
        var pageX = window.pageXOffset || 0;
        var half = r.width / 2;
        var margin = 8;
        if (vw > 0 && r.width + margin * 2 <= vw) {
          var centre = r.left + half + pageX;
          var minC = pageX + margin + half;
          var maxC = pageX + vw - margin - half;
          var clamped = centre < minC ? minC : (centre > maxC ? maxC : centre);
          if (Math.abs(clamped - centre) > 1) {
            node.style.setProperty('left', Math.round(clamped) + 'px', 'important');
          }
        }
      }

      if (!invisible && !pastEnd) return;
      node.style.setProperty('position', 'fixed', 'important');
      node.style.setProperty('top', 'auto', 'important');
      node.style.setProperty('bottom', '18px', 'important');
      node.style.setProperty('left', 'auto', 'important');
      node.style.setProperty('right', '18px', 'important');
      node.style.setProperty('transform', 'none', 'important');
    });

    state.activeNode = node;
    state.activeAnchor = null;
    state.activeZone = place.zone;
    state.items.push({ node: node, popupIndex: popupIdx, clicked: false });

    // v3.5 — auto-scroll removed. The user must scroll naturally to
    // discover each popup at its admin-set position.
  }

  // v3.5 — admin position dropdown. Each popup item carries one of:
  //   "top" / "quarter" / "middle" / "three-quarter" / "bottom" / "random"
  // We map these to vertical fractions (0–1) of the article body and pin
  // the popup at that fraction with a small horizontal jitter. "random"
  // picks one of the 5 named slots, preferring a different one than the
  // previous popup's zone for natural variation.
  var POSITION_FRACTIONS = {
    'top': 0.10,
    'quarter': 0.30,
    'middle': 0.50,
    'three-quarter': 0.70,
    'bottom': 0.88
  };
  var POSITION_TO_ZONE = {
    'top': 0, 'quarter': 0, 'middle': 1, 'three-quarter': 2, 'bottom': 2
  };

  function computePosition(requestedPos, prevZone, adZones) {
    var articleRoot = getArticleRoot();
    var rect = articleRoot.getBoundingClientRect();
    var scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    var scrollX = window.pageXOffset || document.documentElement.scrollLeft || 0;
    var articleTop = rect.top + scrollY;
    // Ensure at least 600px so each of the 5 slots has working room
    // even on tiny test pages. Real articles are usually much taller.
    var articleHeight = Math.max(600, rect.height);
    var articleLeft = rect.left + scrollX;
    var articleWidth = Math.max(280, rect.width);

    var pos = requestedPos || 'random';
    if (pos === 'random') {
      pos = pickRandomSlot(prevZone);
    }
    var fraction = POSITION_FRACTIONS[pos];
    if (fraction == null) fraction = 0.5;
    var zone = POSITION_TO_ZONE[pos];
    if (zone == null) zone = 1;

    // The admin picked a slot, so USE it. Only move if something is there.
    //
    // This used to jitter on the first attempt too, so the popup landed
    // ±60px off the chosen fraction every single time, whether or not there
    // was anything to dodge — "middle" was never actually the middle, and a
    // position dropdown that is always approximately obeyed reads as ignored.
    // The jitter exists to dodge an ad zone; it now runs only when there is
    // one in the way, and falls back to the exact position if no clear offset
    // is found rather than leaving it wherever the last random guess landed.
    var baseY = articleTop + fraction * articleHeight;
    var top = baseY;
    if (zonesOverlap(baseY, adZones)) {
      // Nearest clear spot, not a random one. The offsets are tried closest
      // first and alternate above/below, so the popup ends up as near the
      // admin's slot as the page allows. Eight random draws inside ±60px
      // could all land back on the ad — rare, but it happened about 1 run in
      // 60 in testing, and when it does the popup sits on top of an ad.
      var OFFSETS = [36, -36, 72, -72, 110, -110, 150, -150];
      for (var attempt = 0; attempt < OFFSETS.length; attempt++) {
        var candY = baseY + OFFSETS[attempt];
        if (!zonesOverlap(candY, adZones)) { top = candY; break; }
      }
    }

    // X: small horizontal jitter within the central 40% of article width.
    var x = articleLeft + articleWidth * (0.3 + Math.random() * 0.4);

    return { top: Math.round(top), left: Math.round(x), zone: zone };
  }

  // For "random" — pick one of the 5 named slots, biased away from the
  // previous popup's zone so consecutive randoms feel different.
  function pickRandomSlot(prevZone) {
    var slots = ['top', 'quarter', 'middle', 'three-quarter', 'bottom'];
    if (prevZone == null || prevZone < 0) {
      return slots[Math.floor(Math.random() * slots.length)];
    }
    // Filter out slots whose zone equals prevZone.
    var fresh = slots.filter(function(s) {
      return POSITION_TO_ZONE[s] !== prevZone;
    });
    var pool = fresh.length > 0 ? fresh : slots;
    return pool[Math.floor(Math.random() * pool.length)];
  }


  function buildItem(item, index, total, popupIdx) {
    var span = document.createElement('a');
    span.className = ITEM_CLASS;
    span.setAttribute('role', 'button');
    span.setAttribute('href', '#');
    span.setAttribute('data-eg-item', String(popupIdx));

    var bg = item.highlightColor || '';
    var fg = item.textColor || (state.config && state.config.theme && state.config.theme.textColor) || DEFAULT_THEME.textColor;
    if (bg) span.style.background = bg;
    span.style.color = fg;
    span.textContent = item.text || ('Continue (' + (index + 1) + '/' + total + ')');

    span.addEventListener('click', function(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      // Anti-bot: ignore clicks while tab hidden.
      if (document.hidden) return;

      // Find the matching state item for this DOM node.
      var stateItem = null;
      for (var i = 0; i < state.items.length; i++) {
        if (state.items[i].node === span) { stateItem = state.items[i]; break; }
      }
      if (!stateItem || stateItem.clicked) return;

      // v3.4 — no click gate. The popup interval already gates *when* a
      // popup reveals; once it's on screen the click always counts. The
      // old dwell/scroll gate caused clicks to be silently rejected
      // because the auto-derived minDwell could exceed the time the
      // user had been on the page → user clicked many times, page
      // never advanced.

      stateItem.clicked = true;
      span.classList.add('__eg_at_disabled');
      span.style.opacity = '0';
      span.style.transform = 'translateY(-4px) scale(0.96)';
      setTimeout(function() {
        if (span.parentNode) span.parentNode.removeChild(span);
      }, 320);

      // Sequential-reveal bookkeeping: remember when this click happened
      // and which zone was used so the NEXT popup waits the configured
      // interval and lands in a different zone.
      state.clicked++;
      state.lastClickAtMs = state.dwellMs;
      state.lastAnchorEl = state.activeAnchor || null;
      state.lastZone = state.activeZone;
      state.activeNode = null;
      state.activeAnchor = null;
      state.activeZone = -1;
      state.nextPopupIndex = state.clicked;

      // Toast the admin's post-click message ("Keep reading…") so the
      // user knows what to do next.
      showPostClickToast(
        (state.config && state.config.popupAfterClickMessage) ||
          'Nice — keep reading.'
      );

      reportProgress();
      checkDone();
      // Try to schedule the next popup right away — the time gate inside
      // schedulePopupReveal will hold it back if the interval hasn't
      // elapsed yet.
      schedulePopupReveal();
    });

    return span;
  }

  function shake(node) {
    node.classList.remove('__eg_at_shake');
    // Force reflow so the animation restarts.
    void node.offsetWidth;
    node.classList.add('__eg_at_shake');
  }

  function showHint(target, text) {
    var existing = target.querySelector('.__eg_at_hint');
    if (existing) return;
    var hint = document.createElement('span');
    hint.className = '__eg_at_hint';
    hint.textContent = ' ' + text;
    target.appendChild(hint);
    setTimeout(function() {
      if (hint.parentNode) hint.parentNode.removeChild(hint);
    }, 2400);
  }

  /**
   * Brief floating message shown right after a popup is clicked, telling
   * the user what to do next (admin-configured copy). Fades in at top of
   * viewport, auto-dismisses after ~3 seconds.
   */
  function showPostClickToast(message) {
    if (!message) return;
    var prev = document.getElementById('__eg_at_post_click');
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev);

    var t = document.createElement('div');
    t.id = '__eg_at_post_click';
    t.className = '__eg_at_post_click';
    t.textContent = String(message);
    if (document.body) {
      document.body.appendChild(t);
    } else {
      document.addEventListener('DOMContentLoaded', function() {
        document.body.appendChild(t);
      });
      return;
    }
    setTimeout(function() {
      t.classList.add('__eg_at_post_click_out');
    }, 2700);
    setTimeout(function() {
      if (t.parentNode) t.parentNode.removeChild(t);
    }, 3300);
  }

  function checkDone() {
    var cfg = state.config;
    var total = (cfg && cfg.popups && cfg.popups.length) || 0;
    if (state.clicked >= total) {
      // small breathing pause so the user sees the last fade
      setTimeout(onAllDone, 500);
    }
  }

  function onAllDone() {
    var cfg = state.config;
    if (!cfg) return;
    if (!cfg.isFinal) {
      window.location.href = cfg.nextPageUrl;
      return;
    }
    showFinalCta();
  }

  function showFinalCta() {
    var cfg = state.config;

    // Step 1: render the "Generate Key" button. Click → API → reveal the
    // key + copy button + an "Open Task Page" link. NO auto-submit.
    var anchor = pickAnchors(1)[0];
    var btn = document.createElement('a');
    btn.className = ITEM_CLASS + ' ' + FINAL_CLASS;
    btn.setAttribute('role', 'button');
    btn.setAttribute('href', '#');
    btn.textContent = cfg.generateKeyButtonLabel || 'Generate My Unique Key';

    btn.addEventListener('click', function(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (state.busy) return;
      state.busy = true;
      var oldText = btn.textContent;
      btn.textContent = 'Generating\\u2026';
      btn.classList.add('__eg_at_busy');
      generateKey().then(function(result) {
        if (result.error) {
          state.busy = false;
          btn.textContent = oldText;
          btn.classList.remove('__eg_at_busy');
          showInlineError(btn, result.error);
          return;
        }
        // Replace the CTA button with the key reveal card.
        var card = buildKeyRevealCard(result.key);
        if (btn.parentNode) {
          btn.parentNode.insertBefore(card, btn);
          btn.parentNode.removeChild(btn);
        } else {
          document.body.appendChild(card);
        }
        // v3.5: no auto-scroll — user finds the key card via natural scroll.
      });
    });

    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    } else {
      floatNode(btn, 0, 1);
      document.body.appendChild(btn);
    }
    // v3.5: no auto-scroll on the final-page CTA either.
  }

  function buildKeyRevealCard(key) {
    // The reader clicks this, so it must be the public site — not the host we
    // happened to be fetched from.
    var taskPageUrl = APP_ORIGIN + '/article-tasks/' + encodeURIComponent(taskId) +
                      '?key=' + encodeURIComponent(key);

    var card = document.createElement('div');
    card.className = '__eg_at_key_card';
    card.innerHTML =
      '<div class="__eg_at_key_badge">' +
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M5 13l4 4L19 7"/>' +
        '</svg>' +
      '</div>' +
      '<div class="__eg_at_key_title">Task complete \\u2014 here\\u2019s your unique key</div>' +
      '<div class="__eg_at_key_head">Unique Key</div>' +
      '<div class="__eg_at_key_value"></div>' +
      '<div class="__eg_at_key_actions">' +
        '<button type="button" class="__eg_at_btn_copy">' +
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
            '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>' +
          '</svg>' +
          '<span class="__eg_at_btn_label">Copy Key</span>' +
        '</button>' +
        '<a class="__eg_at_btn_submit" target="_blank" rel="noopener">' +
          '<span>Submit on EarnGPT</span>' +
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>' +
          '</svg>' +
        '</a>' +
      '</div>' +
      '<div class="__eg_at_key_hint">The key won\\u2019t be shown again \\u2014 copy it before leaving this page.</div>';

    card.querySelector('.__eg_at_key_value').textContent = key;
    var copyBtn = card.querySelector('.__eg_at_btn_copy');
    var copyLabel = copyBtn.querySelector('.__eg_at_btn_label');
    copyBtn.addEventListener('click', function(ev) {
      ev.preventDefault();
      copyToClipboard(key, function(ok) {
        copyLabel.textContent = ok ? 'Copied' : 'Press Ctrl+C';
        if (ok) copyBtn.classList.add('__eg_at_btn_copy_ok');
        setTimeout(function() {
          copyLabel.textContent = 'Copy Key';
          copyBtn.classList.remove('__eg_at_btn_copy_ok');
        }, 1500);
      });
    });
    var openBtn = card.querySelector('.__eg_at_btn_submit');
    openBtn.setAttribute('href', taskPageUrl);

    return card;
  }

  /**
   * Copy text to clipboard. Tries the modern Clipboard API only if it's
   * available without a permission prompt; falls back to the legacy
   * execCommand path which never triggers a permission dialog.
   */
  function copyToClipboard(text, cb) {
    var done = function(ok) { try { cb && cb(ok); } catch (e) {} };
    // Permissionless fallback: hidden textarea + execCommand('copy').
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) { return done(true); }
    } catch (e) { /* fall through */ }
    // Last-resort: try modern API. May prompt on some browsers — only used
    // if the legacy path failed.
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function() { done(true); },
        function() { done(false); }
      );
      return;
    }
    done(false);
  }

  function showInlineError(target, message) {
    var prev = document.getElementById('__eg_at_inline_err');
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
    var div = document.createElement('div');
    div.id = '__eg_at_inline_err';
    div.className = '__eg_at_error';
    div.textContent = message;
    if (target.parentNode) {
      target.parentNode.insertBefore(div, target.nextSibling);
    }
  }

  // ── API calls ──────────────────────────────────────────────────────────

  function reportProgress() {
    fetch(ORIGIN + '/api/article-tasks/' + encodeURIComponent(taskId) + '/popup-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, page: pageNumber, popupsCompleted: state.clicked })
    }).catch(function() { /* swallow */ });
  }

  function generateKey() {
    return fetch(ORIGIN + '/api/article-tasks/' + encodeURIComponent(taskId) + '/generate-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token })
    })
    .then(function(r) {
      return r.json().then(function(d) {
        if (!r.ok) return { error: d.error || ('HTTP ' + r.status) };
        return { key: d.key };
      });
    })
    .catch(function(err) {
      return { error: (err && err.message) || 'Network error' };
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  function getQueryParam(name) {
    try { return new URL(window.location.href).searchParams.get(name); }
    catch (e) { return null; }
  }

  function ready(fn) {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(fn, 0);
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  // Legacy: kept for the final-page CTA that still uses simple even spacing.
  function pickAnchors(count) {
    if (count <= 0) return [];
    var candidates = collectAnchorCandidates();
    if (candidates.length === 0) return new Array(count).fill(null);
    var anchors = [];
    for (var i = 0; i < count; i++) {
      var ratio = (i + 1) / (count + 1);
      var idx = Math.min(
        candidates.length - 1,
        Math.floor(ratio * candidates.length)
      );
      anchors.push(candidates[idx]);
    }
    return anchors;
  }

  // v3: For each scroll-percent waypoint, find the nearest paragraph anchor
  // whose absolute top is closest to that depth AND not inside an ad zone.
  function pickAnchorsForWaypoints(waypoints, adZones) {
    var candidates = collectAnchorCandidates();
    if (candidates.length === 0 || waypoints.length === 0) {
      return waypoints.map(function() { return null; });
    }
    var docHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
    var scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;

    // Pre-compute each candidate's absolute top.
    var withTops = candidates.map(function(el) {
      var r = el.getBoundingClientRect();
      return { el: el, top: r.top + scrollY };
    });

    var used = {};
    var anchors = [];
    for (var i = 0; i < waypoints.length; i++) {
      var targetTop = (waypoints[i] / 100) * docHeight;
      // Sort candidates by distance to target, skipping ad-overlap + already-used.
      var sorted = withTops.slice().sort(function(a, b) {
        return Math.abs(a.top - targetTop) - Math.abs(b.top - targetTop);
      });
      var picked = null;
      for (var j = 0; j < sorted.length; j++) {
        var c = sorted[j];
        if (used[c.top]) continue;
        if (zonesOverlap(c.top, adZones)) continue;
        picked = c.el;
        used[c.top] = true;
        break;
      }
      anchors.push(picked);
    }
    return anchors;
  }

  function zonesOverlap(absTop, adZones) {
    if (!adZones || adZones.length === 0) return false;
    for (var i = 0; i < adZones.length; i++) {
      if (absTop >= adZones[i].top && absTop <= adZones[i].bottom) return true;
    }
    return false;
  }

  // Find the article body container so badges only appear INSIDE the
  // article's content (never in the sidebar, header, footer, or nav).
  // Preference order: <article>, <main>, [role="main"], the largest <div>
  // containing many <p> tags. Falls back to <body> if nothing matches.
  function getArticleRoot() {
    var preferred = document.querySelector(
      'article, main, [role="main"], [itemprop="articleBody"], .post-content, .entry-content, .article-body, #content'
    );
    if (preferred) return preferred;

    // Heuristic fallback: pick the div containing the most <p> tags with
    // real text content. Filters out sidebars / nav blocks naturally.
    var divs = document.querySelectorAll('div');
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < divs.length; i++) {
      var d = divs[i];
      var ps = d.querySelectorAll('p');
      var score = 0;
      for (var j = 0; j < ps.length; j++) {
        var t = (ps[j].textContent || '').trim();
        if (t.length >= 60) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }
    if (best && bestScore >= 2) return best;

    return document.body;
  }

  function collectAnchorCandidates() {
    var root = getArticleRoot();
    var candidates = Array.prototype.slice.call(
      root.querySelectorAll('p, h2, h3, h4, blockquote, li')
    );
    candidates = candidates.filter(function(el) {
      var t = (el.textContent || '').trim();
      return t.length >= 30 && el.offsetParent !== null;
    });
    if (candidates.length === 0) {
      // Fallback: any direct child of the root that isn't our own injected node.
      candidates = Array.prototype.slice.call(root.children).filter(function(el) {
        return el.id !== STYLE_ID && !el.classList.contains(ITEM_CLASS);
      });
    }
    return candidates;
  }

  /**
   * Position a node absolutely within the document body at a random
   * horizontal offset, vertically distributed by index.
   */
  function floatNode(node, index, total) {
    var docHeight = Math.max(
      document.body.scrollHeight, document.documentElement.scrollHeight
    );
    var safeTop = 80;
    var safeBottom = 100;
    var usable = Math.max(200, docHeight - safeTop - safeBottom);
    var top = safeTop + (usable * (index + 0.5)) / Math.max(1, total);
    node.style.position = 'absolute';
    node.style.top = top + 'px';
    node.style.left = '50%';
    node.style.transform = 'translateX(-50%)';
    node.style.zIndex = '2147483640';
  }

  function injectStyles(theme) {
    var existing = document.getElementById(STYLE_ID);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var t = theme || DEFAULT_THEME;
    var css = [
      // v3.5 — minimal text style. Inherits the article's font /
      // size / weight / line-height so the popup blends in like normal
      // article copy. Admin\\u2019s textColor + highlightColor (if any)
      // are layered on top via inline styles in buildItem.
      '.' + ITEM_CLASS + ' {',
      '  display: inline-block;',
      '  margin: 0;',
      '  padding: 1px 4px;',
      '  border: 0;',
      '  background: transparent;',
      '  font-family: inherit !important;',
      '  font-size: inherit !important;',
      '  font-weight: inherit !important;',
      '  line-height: inherit !important;',
      '  color: inherit;',
      '  text-decoration: underline;',
      '  text-decoration-thickness: 1px;',
      '  text-underline-offset: 3px;',
      '  cursor: pointer;',
      '  transition: opacity 200ms ease, background 200ms ease;',
      '  max-width: calc(100vw - 32px);',
      '  word-break: break-word;',
      '  animation: __eg_at_pop_in 320ms ease both;',
      '}',
      '.' + ITEM_CLASS + ':hover {',
      '  opacity: 0.85;',
      '  text-decoration-thickness: 2px;',
      '}',
      '.' + ITEM_CLASS + ':active { transform: translateY(0); }',
      // v3 engagement: shake animation when click rejected by gate.
      '.' + ITEM_CLASS + '.__eg_at_shake { animation: __eg_at_shake 380ms ease; }',
      '@keyframes __eg_at_shake {',
      '  0%, 100% { transform: translateX(0); }',
      '  20% { transform: translateX(-4px); }',
      '  40% { transform: translateX(4px); }',
      '  60% { transform: translateX(-3px); }',
      '  80% { transform: translateX(3px); }',
      '}',
      '.__eg_at_hint {',
      '  margin-left: 6px; font-size: 0.85em; opacity: 0.85;',
      '  font-weight: 500; font-style: italic;',
      '}',
      // v3 position style: inline-only. Badges are inserted between
      // article paragraphs, never floating in page corners or sidebars.
      '.' + ITEM_CLASS + '.__eg_at_pos_inline {',
      '  display: inline-block; width: auto; max-width: calc(100vw - 32px);',
      '}',
      '.' + ITEM_CLASS + '.__eg_at_disabled { pointer-events: none; }',
      // v3.1 post-click toast — brief instructional message
      '.__eg_at_post_click {',
      '  position: fixed; top: 24px; left: 50%;',
      '  transform: translateX(-50%);',
      '  z-index: 2147483645;',
      '  max-width: calc(100vw - 32px);',
      '  background: linear-gradient(135deg, #0f172a, #1e293b);',
      '  color: #f1f5f9;',
      '  padding: 11px 18px; border-radius: 999px;',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '  font-size: 13px; font-weight: 600; line-height: 1.4;',
      '  border: 1px solid rgba(99,102,241,0.3);',
      '  box-shadow: 0 18px 36px -12px rgba(0,0,0,0.5);',
      '  animation: __eg_at_toast_in 280ms cubic-bezier(0.2, 0.85, 0.3, 1);',
      '  pointer-events: none;',
      '}',
      '.__eg_at_post_click.__eg_at_post_click_out {',
      '  animation: __eg_at_toast_out 480ms ease both;',
      '}',
      '@keyframes __eg_at_toast_in {',
      '  from { opacity: 0; transform: translateX(-50%) translateY(-12px); }',
      '  to   { opacity: 1; transform: translateX(-50%) translateY(0); }',
      '}',
      '@keyframes __eg_at_toast_out {',
      '  from { opacity: 1; transform: translateX(-50%) translateY(0); }',
      '  to   { opacity: 0; transform: translateX(-50%) translateY(-12px); }',
      '}',
      '.' + ITEM_CLASS + '.__eg_at_busy { opacity: 0.7; cursor: progress; }',
      '@keyframes __eg_at_pop_in {',
      '  from { opacity: 0; transform: translateY(8px) scale(0.96); }',
      '  to   { opacity: 1; transform: translateY(0) scale(1); }',
      '}',
      // Final-page CTA — bigger, gradient background, clearly different.
      '.' + FINAL_CLASS + ' {',
      '  display: inline-block;',
      '  padding: 14px 28px;',
      '  font-size: 16px;',
      '  font-weight: 700;',
      '  color: white !important;',
      '  background: linear-gradient(135deg, ' + t.accentColor + ', color-mix(in srgb, ' + t.accentColor + ' 70%, black)) !important;',
      '  border: 0;',
      '  border-radius: 10px;',
      '  box-shadow: 0 12px 30px -8px ' + t.accentColor + '88, 0 4px 10px -2px rgba(0,0,0,0.25);',
      '  letter-spacing: 0.02em;',
      '  margin: 26px auto;',
      '}',
      '.' + FINAL_CLASS + ':hover { transform: translateY(-2px) scale(1.02); }',
      // Inline error
      '.__eg_at_error {',
      '  display: inline-block; margin: 8px 0;',
      '  padding: 8px 12px; border-radius: 6px;',
      '  background: rgba(239,68,68,0.12);',
      '  border: 1px solid rgba(239,68,68,0.4);',
      '  color: #b91c1c; font-size: 13px;',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '}',
      // v3 key reveal card — premium dark UI.
      '.__eg_at_key_card {',
      '  display: block; margin: 32px auto; position: relative;',
      '  max-width: 480px; padding: 28px 24px 22px;',
      '  background: linear-gradient(180deg, #111827 0%, #0b1220 100%);',
      '  color: #f1f5f9;',
      '  border: 1px solid rgba(99,102,241,0.28);',
      '  border-radius: 18px;',
      '  box-shadow:',
      '    0 28px 60px -12px rgba(0,0,0,0.55),',
      '    0 12px 28px -10px rgba(99,102,241,0.35),',
      '    inset 0 1px 0 rgba(255,255,255,0.04);',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '  text-align: center;',
      '  animation: __eg_at_key_in 380ms cubic-bezier(0.2, 0.85, 0.3, 1) both;',
      '}',
      '@keyframes __eg_at_key_in {',
      '  from { opacity: 0; transform: translateY(12px) scale(0.97); }',
      '  to   { opacity: 1; transform: translateY(0)    scale(1); }',
      '}',
      '.__eg_at_key_badge {',
      '  width: 48px; height: 48px; margin: -52px auto 14px;',
      '  display: inline-flex; align-items: center; justify-content: center;',
      '  border-radius: 999px; color: white;',
      '  background: linear-gradient(135deg, #10b981, #059669);',
      '  box-shadow:',
      '    0 12px 28px -6px rgba(16,185,129,0.55),',
      '    0 0 0 4px #0b1220;',
      '}',
      '.__eg_at_key_title {',
      '  font-size: 15px; font-weight: 700; line-height: 1.4;',
      '  color: #f1f5f9; margin-bottom: 18px;',
      '}',
      '.__eg_at_key_head {',
      '  font-size: 10px; font-weight: 700;',
      '  letter-spacing: 0.16em; text-transform: uppercase;',
      '  color: #94a3b8; margin-bottom: 8px;',
      '}',
      '.__eg_at_key_value {',
      '  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;',
      '  font-size: 20px; font-weight: 700;',
      '  letter-spacing: 0.08em; word-break: break-all;',
      '  color: #f8fafc;',
      '  background: rgba(0,0,0,0.35);',
      '  border: 1px dashed rgba(148,163,184,0.25);',
      '  padding: 14px 16px; border-radius: 10px;',
      '  margin-bottom: 16px; user-select: all;',
      '}',
      '.__eg_at_key_actions {',
      '  display: flex; gap: 10px; flex-wrap: wrap;',
      '}',
      '.__eg_at_btn_copy, .__eg_at_btn_submit {',
      '  flex: 1 1 140px; min-width: 130px;',
      '  display: inline-flex; align-items: center; justify-content: center;',
      '  gap: 7px; padding: 11px 16px; border-radius: 10px;',
      '  font-size: 13px; font-weight: 700; cursor: pointer;',
      '  border: 0; font-family: inherit; text-decoration: none;',
      '  transition: transform 140ms ease, box-shadow 140ms ease, background 140ms ease;',
      '}',
      '.__eg_at_btn_copy {',
      '  background: rgba(148,163,184,0.12);',
      '  color: #e2e8f0;',
      '  border: 1px solid rgba(148,163,184,0.18);',
      '}',
      '.__eg_at_btn_copy:hover {',
      '  background: rgba(148,163,184,0.22);',
      '  transform: translateY(-1px);',
      '}',
      '.__eg_at_btn_copy.__eg_at_btn_copy_ok {',
      '  background: rgba(16,185,129,0.18);',
      '  border-color: rgba(16,185,129,0.45);',
      '  color: #6ee7b7;',
      '}',
      '.__eg_at_btn_submit {',
      '  background: linear-gradient(135deg, ' + t.accentColor + ', color-mix(in srgb, ' + t.accentColor + ' 60%, #000));',
      '  color: white !important;',
      '  box-shadow: 0 10px 24px -8px ' + t.accentColor + '88;',
      '}',
      '.__eg_at_btn_submit:hover {',
      '  transform: translateY(-1px);',
      '  box-shadow: 0 14px 30px -8px ' + t.accentColor + 'aa;',
      '}',
      '.__eg_at_key_hint {',
      '  margin-top: 14px; font-size: 11px;',
      '  color: #64748b; line-height: 1.5;',
      '}'
    ].join('\\n');

    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    var head = document.head || document.getElementsByTagName('head')[0];
    if (head) head.appendChild(s);
    else if (document.body) document.body.appendChild(s);
  }
})();
`;
}
