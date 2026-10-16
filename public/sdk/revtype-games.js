/*!
 * RevType Games SDK v1 — connects an HTML5 game (on any domain) to RevType.
 *
 * Add to the game's HTML:
 *   <script src="https://revtype.com/sdk/revtype-games.js"></script>
 *
 * Then, in the game:
 *   RevType.setScore(score)   // the player's current score (may restart from 0 each round)
 *   RevType.addScore(n)       // or: the player just gained n points
 *   RevType.onReady(fn)       // fn({ connected, earning, pointsPer1000 })
 *   RevType.onEarn(fn)        // fn({ awarded, sessionPoints }) when RevType credits points
 *
 * The game only reports its score. RevType (the page the game is embedded in)
 * decides what it is worth, caps it by real play time, and credits the
 * member's RevType points. Opened outside RevType, the calls do nothing.
 */
(function () {
  "use strict";
  if (window.RevType && window.RevType.version) return;

  var inFrame = window.parent && window.parent !== window;
  var parentOrigin = null;
  var state = { connected: false, earning: false, pointsPer1000: 0 };
  // Points gained and not yet sent, and the last score passed to setScore.
  var pending = 0;
  var lastScore = 0;
  var sum = 0;
  var timer = null;
  var readyFns = [];
  var earnFns = [];
  var SEND_EVERY_MS = 3000;

  function post(msg) {
    if (!inFrame) return;
    msg.source = "revtype-sdk";
    msg.v = 1;
    try {
      window.parent.postMessage(msg, parentOrigin || "*");
    } catch (_e) {}
  }

  // Only GAINS are sent; RevType adds them up. A new round (score back to 0)
  // or a page reload therefore never loses points.
  function flush() {
    timer = null;
    if (!state.connected || pending <= 0) return;
    var n = pending;
    pending = 0;
    post({ type: "add", n: n });
  }

  function gain(n) {
    if (n <= 0) return;
    pending += n;
    sum += n;
    schedule();
  }

  function schedule() {
    if (timer) return;
    timer = setTimeout(flush, SEND_EVERY_MS);
  }

  function call(fns, arg) {
    for (var i = 0; i < fns.length; i++) {
      try {
        fns[i](arg);
      } catch (_e) {}
    }
  }

  window.addEventListener("message", function (e) {
    if (!inFrame || e.source !== window.parent) return;
    var d = e.data;
    if (!d || d.source !== "revtype-player") return;
    if (d.type === "welcome") {
      parentOrigin = e.origin;
      state = {
        connected: true,
        earning: !!d.earning,
        pointsPer1000: Number(d.pointsPer1000) || 0,
      };
      call(readyFns, state);
      if (pending > 0) schedule();
    } else if (d.type === "earned") {
      call(earnFns, { awarded: Number(d.awarded) || 0, sessionPoints: Number(d.sessionPoints) || 0 });
    }
  });

  // Send what is pending before the game closes.
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush();
  });

  window.RevType = {
    version: 1,
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
    /** Points reported to RevType in this page so far. */
    getScore: function () {
      return sum;
    },
    onReady: function (fn) {
      if (typeof fn !== "function") return;
      readyFns.push(fn);
      if (state.connected) fn(state);
    },
    onEarn: function (fn) {
      if (typeof fn === "function") earnFns.push(fn);
    },
  };

  post({ type: "hello" });
})();
