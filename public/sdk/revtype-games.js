/*!
 * RevType Games SDK v2 — lets players earn RevType points from your HTML5 game.
 *
 * 1. Add to the game's HTML, just before </body>:
 *      <script src="https://revtype.com/sdk/revtype-games.js"></script>
 *      <script>RevType.init({ gameId: "YOUR_GAME_ID" });</script>
 *
 * 2. In the game code, whenever the player gains points:
 *      RevType.setScore(score)   // the player's current score (may restart from 0 each round)
 *      RevType.addScore(n)       // or: the player just gained n points
 *
 * Works in two places:
 *  - On your own game website: shows a small "Connect RevType" button. The
 *    player signs in to RevType once; after that their points go to their
 *    RevType account, and they withdraw on revtype.com.
 *  - Inside RevType's Games page: already signed in, nothing to show.
 *
 * Traffic: one small request every 30 seconds while the game is in front.
 *
 * If YOUR GAME SERVER decides what players earn (server to server):
 *   RevType.init({ gameId, earnBy: "server" })    // the SDK only connects the account
 *   RevType.onReady(function (info) { ... info.playerKey ... })
 *     → send info.playerKey to your game server once and store it with the
 *       player's account; your server then credits income with it
 *       (POST https://revtype.com/api/games/s2s/credit, signed with your
 *       server key). setScore/addScore are not used in this mode.
 *
 * Sign-in with RevType on your website (your server makes the account):
 *   RevType.getLoginToken().then(function (t) { ... })
 *     → send t to your server; it trades it ONCE for the player at
 *       POST https://revtype.com/api/games/s2s/login { token } (signed like
 *       credit). Never use the permanent playerKey as a login.
 *
 * Optional:
 *   RevType.init({ gameId, badge: false })        // hide the built-in button
 *   RevType.init({ gameId, position: "top-left" }) // bottom-right (default) / bottom-left / top-right / top-left
 *   RevType.connect()                             // open the sign-in window from your own button
 *   RevType.onReady(fn)  // fn({ connected, earning, name, avatar, points, playerKey })
 *     → use info.name and info.avatar (picture URL) as the player's profile in your game
 *   RevType.onEarn(fn)   // fn({ awarded, sessionPoints })
 *
 * RevType decides what a score is worth and limits it by real play time, so
 * the game only reports — it never decides payouts.
 */
(function () {
  "use strict";
  if (window.RevType && window.RevType.version) return;

  // ── Where RevType is: the origin this script was loaded from ──────────────
  var API = "https://revtype.com";
  try {
    var cs = document.currentScript;
    if (cs && cs.src) API = new URL(cs.src).origin;
  } catch (_e) {}

  var TOKEN_KEY = "revtype_connect_token";
  var inFrame = false;
  try {
    inFrame = window.parent && window.parent !== window;
  } catch (_e) {
    inFrame = true;
  }

  var cfg = { gameId: null, badge: true, position: "bottom-right", earnBy: "score" };
  var mode = "pending"; // "player" (inside RevType) | "site" (your website)
  var state = {
    connected: false,
    earning: false,
    name: "",
    points: 0,
    pointsPer1000: 0,
    withdrawUrl: "",
    playerKey: "",
    avatar: "",
  };
  var readyFns = [];
  var earnFns = [];
  var lastScore = 0;
  var pending = 0; // gains not yet handed on

  function call(fns, arg) {
    for (var i = 0; i < fns.length; i++) {
      try {
        fns[i](arg);
      } catch (_e) {}
    }
  }
  function publicState() {
    return {
      connected: state.connected,
      earning: state.earning,
      name: state.name,
      avatar: state.avatar,
      points: state.points,
      pointsPer1000: state.pointsPer1000,
      playerKey: state.playerKey,
    };
  }
  function ready() {
    call(readyFns, publicState());
    renderBadge();
  }
  function gain(n) {
    if (n <= 0) return;
    pending += n;
    if (mode === "player") schedulePlayer();
  }

  // ── Mode 1: inside RevType's game player (iframe) ────────────────────────
  var parentOrigin = null;
  var playerTimer = null;
  function postParent(msg) {
    msg.source = "revtype-sdk";
    msg.v = 2;
    try {
      window.parent.postMessage(msg, parentOrigin || "*");
    } catch (_e) {}
  }
  function flushPlayer() {
    playerTimer = null;
    if (mode !== "player" || pending <= 0) return;
    var n = pending;
    pending = 0;
    postParent({ type: "add", n: n });
  }
  function schedulePlayer() {
    if (!playerTimer) playerTimer = setTimeout(flushPlayer, 3000);
  }

  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d) return;
    // RevType player → this game
    if (inFrame && e.source === window.parent && d.source === "revtype-player") {
      if (d.type === "welcome") {
        parentOrigin = e.origin;
        // A slow load may have started website mode already: inside RevType
        // the player owns the session, so stop ours (it would end theirs).
        if (mode === "site") {
          stopTimers();
          sessionId = null;
        }
        mode = "player";
        state.connected = true;
        state.earning = !!d.earning;
        state.pointsPer1000 = Number(d.pointsPer1000) || 0;
        state.playerKey = d.playerKey || "";
        state.name = d.name || "";
        state.avatar = d.avatar || "";
        ready();
        if (pending > 0) schedulePlayer();
      } else if (d.type === "earned") {
        call(earnFns, { awarded: Number(d.awarded) || 0, sessionPoints: Number(d.sessionPoints) || 0 });
      }
      return;
    }
    // Connect popup (revtype.com) → this game
    if (e.origin === API && d.source === "revtype-connect" && d.token) {
      saveToken(d.token);
      state.name = d.name || "";
      startSite();
    }
  });

  // ── Mode 2: on your own game website ─────────────────────────────────────
  var token = null;
  var sessionId = null;
  var sessionTotal = 0;
  var sentTotal = 0;
  var beatTimer = null;
  var starting = false;

  function saveToken(t) {
    token = t;
    try {
      localStorage.setItem(TOKEN_KEY, t);
    } catch (_e) {}
  }
  function loadToken() {
    // Coming back from a blocked popup: the token is in the URL fragment.
    try {
      var m = /[#&]revtype_token=([^&]+)/.exec(location.hash);
      if (m) {
        saveToken(decodeURIComponent(m[1]));
        history.replaceState(null, "", location.pathname + location.search);
        return;
      }
    } catch (_e) {}
    try {
      token = localStorage.getItem(TOKEN_KEY);
    } catch (_e) {
      token = null;
    }
  }
  function stopTimers() {
    if (beatTimer) clearInterval(beatTimer);
    beatTimer = null;
  }
  function dropToken() {
    token = null;
    sessionId = null;
    state.connected = false;
    state.earning = false;
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (_e) {}
    stopTimers();
    ready();
  }

  function api(method, action, body) {
    return fetch(API + "/api/games/ext/" + action, {
      method: method,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: body ? JSON.stringify(body) : undefined,
      keepalive: method === "POST",
    }).then(function (r) {
      return r
        .json()
        .catch(function () {
          return {};
        })
        .then(function (d) {
          if (r.status === 401) dropToken();
          return { status: r.status, ok: r.ok, data: d || {} };
        });
    });
  }

  function refreshMe() {
    if (!token) return Promise.resolve();
    return api("GET", "me").then(function (r) {
      if (!r.ok) return;
      state.name = r.data.name || state.name;
      state.points = Number(r.data.points) || 0;
      state.withdrawUrl = r.data.withdrawUrl || "";
      state.playerKey = r.data.playerKey || "";
      state.avatar = r.data.avatar || "";
      renderBadge();
    });
  }

  function startSite() {
    if (mode !== "site" || !token || starting) return;
    starting = true;
    stopTimers();
    refreshMe()
      .then(function () {
        // Server mode: your game server credits income; no play session here.
        if (cfg.earnBy === "server") {
          state.connected = !!token;
          state.earning = !!token;
          starting = false;
          ready();
          startBalanceRefresh();
          return null;
        }
        if (!token || !cfg.gameId) return null;
        return api("POST", "session", { gameId: cfg.gameId });
      })
      .then(function (r) {
        starting = false;
        state.connected = !!token;
        if (!r || !r.ok) {
          ready();
          return;
        }
        sessionId = r.data.sessionId;
        // Points gained before connecting count toward this session.
        sessionTotal = pending;
        pending = 0;
        sentTotal = 0;
        state.earning = !!(r.data.score && r.data.score.enabled);
        state.pointsPer1000 = (r.data.score && r.data.score.pointsPer1000) || 0;
        var beatMs = (Number(r.data.beatSeconds) || 30) * 1000;
        beat(false);
        beatTimer = setInterval(function () {
          beat(false);
        }, beatMs);
        ready();
      })
      .catch(function () {
        starting = false;
      });
  }

  // Only the tab in front takes the session back — otherwise two open tabs
  // would keep ending each other's session (one open session per player).
  // Server mode: income arrives from your server, so refresh the button's
  // balance once a minute while the game is in front.
  var balanceTimer = null;
  function startBalanceRefresh() {
    if (balanceTimer) return;
    balanceTimer = setInterval(function () {
      if (!document.hidden && token) refreshMe();
    }, 60000);
  }

  function restartSession() {
    sessionId = null;
    stopTimers();
    if (!document.hidden) startSite();
  }
  document.addEventListener("visibilitychange", function () {
    if (mode === "site" && !document.hidden && token && !sessionId) startSite();
  });

  // One request per beat: play time AND the running score together.
  // `final` = the page is closing; pay any score due now.
  function beat(final) {
    if (!sessionId || (document.hidden && !final)) return;
    sessionTotal += pending;
    pending = 0;
    var total = sessionTotal;
    var body = { gameId: cfg.gameId, sessionId: sessionId };
    if (total > 0) body.scoreTotal = total;
    if (final) body.final = true;
    api("POST", "heartbeat", body).then(function (r) {
      if (r.ok) {
        sentTotal = total;
        if (r.data.awarded > 0) onAwarded(r.data);
      } else if (r.status === 409) {
        // Session closed (another tab, or idle too long): keep unsent points.
        pending += total - sentTotal;
        restartSession();
      }
    });
  }

  function onAwarded(d) {
    state.points += Number(d.awarded) || 0;
    renderBadge();
    call(earnFns, { awarded: Number(d.awarded) || 0, sessionPoints: Number(d.sessionPoints) || 0 });
  }

  function connect() {
    var url =
      API +
      "/connect/games?origin=" +
      encodeURIComponent(location.origin) +
      "&return=" +
      encodeURIComponent(location.href.split("#")[0]);
    var w = null;
    try {
      w = window.open(url, "revtype_connect", "width=440,height=680");
    } catch (_e) {}
    if (!w) {
      // Popup blocked: go there in this tab; it comes back with the token.
      location.href = url;
    }
  }

  // Connected in another tab of the same website: pick it up here too.
  window.addEventListener("storage", function (e) {
    if (mode === "site" && e.key === TOKEN_KEY && e.newValue && !token) {
      token = e.newValue;
      startSite();
    }
  });

  window.addEventListener("pagehide", function () {
    if (mode === "site") beat(true);
    if (mode === "player") flushPlayer();
  });

  // ── The built-in button ──────────────────────────────────────────────────
  var badgeEl = null;
  function renderBadge() {
    if (mode !== "site" || !cfg.badge || !document.body) {
      if (badgeEl) badgeEl.style.display = "none";
      return;
    }
    if (!badgeEl) {
      badgeEl = document.createElement("button");
      badgeEl.type = "button";
      var pos = String(cfg.position || "bottom-right").split("-");
      var s = badgeEl.style;
      s.position = "fixed";
      s[pos[0] === "top" ? "top" : "bottom"] = "12px";
      s[pos[1] === "left" ? "left" : "right"] = "12px";
      s.zIndex = "2147483647";
      s.padding = "8px 12px";
      s.border = "0";
      s.borderRadius = "999px";
      s.font = "600 13px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
      s.color = "#fff";
      s.background = "linear-gradient(135deg,#059669,#0d9488)";
      s.boxShadow = "0 4px 14px rgba(0,0,0,.35)";
      s.cursor = "pointer";
      badgeEl.addEventListener("click", function () {
        if (!state.connected) connect();
        else window.open(state.withdrawUrl || API + "/withdrawal", "_blank", "noopener");
      });
      document.body.appendChild(badgeEl);
    }
    badgeEl.style.display = "";
    badgeEl.textContent = state.connected
      ? "RevType: " + Number(state.points || 0).toLocaleString() + " pts · Withdraw"
      : "Earn rewards · Connect RevType";
    badgeEl.title = state.connected
      ? "Signed in as " + (state.name || "RevType member") + ". Points go to your RevType account."
      : "Sign in to RevType to turn your game points into rewards you can withdraw.";
  }

  // ── Decide the mode ──────────────────────────────────────────────────────
  function goSite() {
    if (mode !== "pending") return;
    mode = "site";
    loadToken();
    if (token) startSite();
    else ready();
  }
  if (inFrame) {
    postParent({ type: "hello" });
    // No answer from a RevType player → this is your own website (maybe in a frame).
    setTimeout(goSite, 1500);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", goSite);
  } else {
    setTimeout(goSite, 0);
  }

  window.RevType = {
    version: 2,
    init: function (opts) {
      opts = opts || {};
      if (opts.gameId) cfg.gameId = String(opts.gameId);
      if (opts.badge === false) cfg.badge = false;
      if (opts.position) cfg.position = String(opts.position);
      if (opts.earnBy === "server") cfg.earnBy = "server";
      if (mode === "site") {
        if (token && !sessionId) startSite();
        renderBadge();
      }
    },
    connect: connect,
    disconnect: dropToken,
    /** Server mode: the player's key for your game server ("" until connected). */
    getPlayerKey: function () {
      return state.playerKey;
    },
    /**
     * Sign-in with RevType: a fresh one-time login token (Promise → string,
     * "" when not connected or on error). Valid 5 minutes, usable once — your
     * game SERVER trades it at POST /api/games/s2s/login.
     */
    getLoginToken: function () {
      if (mode !== "site" || !token) return Promise.resolve("");
      return api("POST", "login-token", {}).then(
        function (r) {
          return (r.ok && r.data && r.data.loginToken) || "";
        },
        function () {
          return "";
        }
      );
    },
    /** Re-read the player's RevType balance (e.g. right after your server credited). */
    refresh: function () {
      return refreshMe();
    },
    isConnected: function () {
      return state.connected;
    },
    setScore: function (n) {
      n = Math.floor(Number(n));
      if (!isFinite(n) || n < 0) return;
      // Lower than before = a new round started from 0: all of it is new.
      gain(n >= lastScore ? n - lastScore : n);
      lastScore = n;
    },
    addScore: function (n) {
      n = Math.floor(Number(n));
      if (!isFinite(n) || n <= 0) return;
      gain(n);
    },
    onReady: function (fn) {
      if (typeof fn !== "function") return;
      readyFns.push(fn);
      if (mode !== "pending") fn(publicState());
    },
    onEarn: function (fn) {
      if (typeof fn === "function") earnFns.push(fn);
    },
  };
})();
