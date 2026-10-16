/**
 * The prompt the owner gives an AI coding assistant, together with a finished
 * game's code, to add the RevType integration once (owner, 2026-10-17). Shown
 * with a Copy button in the game Setup guide. String.raw keeps the regex
 * backslashes; there are no backticks in the text on purpose.
 */
export function buildIntegrationPrompt(revtypeOrigin: string, gameId: string | null): string {
  const id = gameId ?? "(paste in the game admin later)";
  return String.raw`You are adding RevType integration to an EXISTING, FINISHED HTML5 game that
has its own game server. Do not rebuild or redesign the game. Make the
smallest safe changes, keep every existing feature working, and match the
project's existing code style, framework and folder structure.

RevType (${revtypeOrigin}) is a rewards platform. After this work:
- a player clicks "Connect RevType" once in the game and signs in to RevType;
- OUR game server decides what the player earned and reports it to RevType
  server-to-server;
- the player sees the points in their RevType wallet and withdraws there.
Do NOT build any withdraw, payout or wallet system in the game.

The RevType Game ID for this game: ${id}

=====================================================================
STEP 0 - READ THE PROJECT FIRST, THEN SHOW ME A PLAN (no code yet)
=====================================================================
Inspect the codebase and report:
1. Frontend: framework/engine, the HTML entry file(s), how pages are served.
2. Backend: language/framework, how players log in, the players/users table,
   the database and migration tool, existing background jobs/queues.
3. Where the game currently decides that a player earned something (coins,
   score, rewards, match results, level complete, daily bonus). Is it decided
   on the SERVER or only in the browser? List the exact files/functions.
4. The existing admin/settings area (if any) and how settings are stored.
5. Existing security headers (CSP, X-Frame-Options, COOP) and hosting setup.
Then propose: which server-side event(s) will trigger a RevType payout, the
conversion (e.g. 100 coins = 1 RevType point), and the list of files you will
add/change. WAIT for my OK before changing code.

IMPORTANT: if the income is currently decided only in the browser, say so
clearly and propose moving the decision (or at least validation) to the
server. RevType payouts must be based on server-validated results only.

=====================================================================
STEP 1 - SETTINGS IN THE GAME ADMIN (paste-only, no code edits later)
=====================================================================
Add to the existing game admin (or, if there is none, a server config file +
env vars) a "RevType" settings section with exactly these fields:
  - "RevType enabled" (on/off, default off)
  - "RevType Game ID" - accepts EITHER the plain ID OR the full snippet pasted
    from RevType admin. Extract with /gameId\s*:\s*["']([^"']+)["']/ ; trim.
  - "RevType website address" - e.g. https://play.mygames.com (must exactly
    match the address listed in RevType -> Games -> Settings -> Your game websites)
  - "RevType server key" - starts with rtgs_ ; stored ONLY on the server
    (env var REVTYPE_SERVER_KEY or encrypted DB setting). Never sent to the
    browser, never logged, never committed to git. Show it masked in the admin.
  - "RevType points per game currency" - integer conversion used by the
    server, e.g. 1 point per 100 coins.
  - "Show RevType button" (on/off) and "Button position"
    (bottom-right / bottom-left / top-right / top-left)
  - A "Test connection" button that calls RevType's player endpoint (Step 3,
    optional call) with a dummy key and reports: "Signature OK" if RevType
    answers 404 Unknown player, or the exact error otherwise (401 = wrong
    server key, 403 = website address not listed in RevType).
The browser receives only: enabled, gameId, showButton, position.

=====================================================================
STEP 2 - GAME PAGE (frontend)
=====================================================================
- Before </body> of the game's HTML entry, add a small loader that:
  * stops if RevType is disabled or there is no Game ID;
  * inserts <script async src="${revtypeOrigin}/sdk/revtype-games.js">;
  * on load: RevType.init({ gameId, earnBy: "server", badge: showButton, position });
  * on error (offline/blocked): does nothing - the game keeps working.
- NEVER download, bundle or self-host the SDK - it must load from
  ${revtypeOrigin}, or the connection breaks.
- Link the player:
    RevType.onReady(function (info) {
      if (info.connected && info.playerKey) {
        // POST to OUR server with the logged-in player's session:
        // /api/revtype/link  { playerKey: info.playerKey, name: info.name, avatar: info.avatar }
      }
    });
  Server: save it on the current player's account in a new column
  "revtype_player_key" (add a migration; overwrite if it changed).
- PROFILE FROM REVTYPE: once connected, the player's in-game profile must
  show their RevType identity everywhere (header, profile page, lobby,
  leaderboards, match screens): display name = info.name, profile picture =
  info.avatar (a full image URL; if empty, keep the game's default avatar).
  Replace guest/random names (e.g. "Guest", generated names) with it. Save
  name and avatar on our server in the /api/revtype/link call and update them
  on every onReady (the member may change them on RevType). On Disconnect,
  go back to the game's own guest profile. If the
  game has no player login, link by the game's existing player id/device id
  and explain the limitation in your report.
- Optional: after our server pays, the page may call RevType.refresh() to
  update the button's balance.
- If the game already has a menu, you may add our own "Connect RevType"
  button there instead: init with badge:false and call RevType.connect().
- Make sure the floating button does not cover game controls at 360x640 and
  640x360; move it with "position" if needed.

=====================================================================
STEP 3 - GAME SERVER (backend) - paying players
=====================================================================
Create ONE module (in the server's language) with ONE function:
  payOnRevType(playerKey, points, reference) -> { ok, credited, duplicate?, capped? }

Request (exactly):
  POST ${revtypeOrigin}/api/games/s2s/credit
  Headers:
    Content-Type: application/json
    X-RevType-Site: <RevType website address from settings>
    X-RevType-Signature: hex( HMAC-SHA256( key = REVTYPE_SERVER_KEY, message = raw JSON body ) )
  Body (sign the EXACT bytes you send):
    { "playerKey": "...", "gameId": "<Game ID>", "points": 50, "reference": "match-98123" }

Rules:
- points: whole number >= 1. Convert from game currency with integer math;
  carry the remainder forward per player so nothing is lost or rounded up.
- reference: OUR unique id for this payout, 1-100 chars of [A-Za-z0-9._:-]
  (e.g. "match-<matchId>", "level-<playerId>-<levelId>"). The same reference
  never pays twice -> retries are safe.
- Add a table revtype_payouts (id, player_id, points, reference UNIQUE,
  status pending/paid/failed, response, attempts, created_at, updated_at).
  Insert the payout row FIRST (inside the same DB transaction that records
  the in-game reward), then send to RevType from a background job/queue,
  then mark paid. Retry pending/failed with the SAME reference with backoff
  (1 min, 5 min, 30 min, 2 h). Never create a new reference for a retry.
- Hook the payout into the EXISTING server-side reward points you found in
  Step 0 - do not duplicate reward logic; call one helper from there.
- Only pay players with a revtype_player_key. Players without one keep
  earning in-game as before (optional: pay their backlog after they connect).
- Responses: ok:true credited:N -> paid; duplicate:true -> already paid (mark
  paid); capped:true -> paid what RevType allowed (store it); HTTP 401 bad
  signature / 403 unknown site -> config error: alert admin, stop retrying;
  404 unknown player -> clear that player's key, ask them to reconnect;
  5xx/timeout -> retry later.
- Optional: POST ${revtypeOrigin}/api/games/s2s/player { playerKey } (same
  signing) returns { name, points, usd, active }.
- Pay per meaningful event (match end, level complete, daily reward) - NOT
  per click/frame. Queue with a concurrency limit (a few requests/second per
  server) so traffic spikes never flood RevType.
- Anti-cheat: payouts only from server-validated results; add a sane
  per-player hourly/daily maximum in our server too.

=====================================================================
STEP 4 - HOSTING / HEADERS
=====================================================================
- HTTPS only. If CSP is sent: script-src and connect-src must allow
  ${revtypeOrigin}. Do not send "Cross-Origin-Opener-Policy: same-origin"
  (it breaks the sign-in popup) - use none or "same-origin-allow-popups".
- Allow localStorage (the SDK remembers the connection for 30 days).
- If the game is also shown inside RevType's Games page: no X-Frame-Options;
  if CSP is sent add  frame-ancestors 'self' ${revtypeOrigin}

=====================================================================
STEP 5 - README + REPORT
=====================================================================
Add a README section "RevType setup":
1. RevType admin -> Games -> Settings -> "Your game websites": add the game
   website address; click "Show server keys" and copy the key.
2. RevType admin -> Games -> New game: title, icon, category, game URL.
   Create, open it again, copy the Game ID from the Setup guide.
3. In our game admin -> RevType: paste Game ID, website address, server key;
   set the points conversion; turn RevType on; press "Test connection".

Finally report each item as done / not done:
[ ] No existing feature changed behaviour (list what you touched).
[ ] Game ID field accepts the plain ID and the full RevType snippet.
[ ] Server key only on the server (not in page source, not in logs, not in git).
[ ] Signature = HMAC-SHA256 hex of the exact raw body sent.
[ ] Same reference retried -> duplicate, no double pay.
[ ] Payout rows saved in the same transaction as the in-game reward; retries
    reuse the reference; config errors stop retries and alert.
[ ] Payouts only from server-validated results.
[ ] RevType disabled/unreachable -> game works normally, payouts stay pending.
[ ] "Test connection" works.
[ ] Connect button doesn't cover controls at 360x640 and 640x360.
[ ] playerKey linking works and survives reloads and re-logins.
[ ] After Connect RevType, the profile shows the RevType name and picture
    everywhere in the game (no "Guest" left).`;
}
