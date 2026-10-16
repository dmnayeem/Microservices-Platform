"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { toast } from "@/lib/toast";
import { buildIntegrationPrompt } from "./game-integration-prompt";

/**
 * Setup guide for connecting a self-built HTML5 game to RevType (owner,
 * 2026-10-17): shown first when adding a game, written for a non-technical
 * admin — every step says which file, where in it, and what to paste. Games
 * live on the owner's own game website; players connect their RevType
 * account there (src/lib/game-connect.ts).
 * The SDK itself is public/sdk/revtype-games.js; scores are paid by
 * reportScore in src/lib/game-session.ts.
 */

/** The address games load the SDK from and must allow framing by. */
export function siteOrigin(): string {
  const env = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (env) {
    try {
      return new URL(env).origin;
    } catch {
      /* not a URL — fall back to the page's own origin */
    }
  }
  return typeof window !== "undefined" ? window.location.origin : "https://revtype.com";
}

export function CopyBlock({ label, value }: { label: string; value: string }) {
  const copy = async () => {
    if (await copyText(value)) toast.success("Copied");
    else toast.error("Couldn't copy", { description: "Select the text and copy it manually." });
  };
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-slate-800">
        <span className="text-[11px] text-slate-400">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-emerald-400 hover:text-emerald-300 hover:bg-white/5"
        >
          <Copy className="w-3.5 h-3.5" /> Copy
        </button>
      </div>
      <pre className="px-3 py-2 text-[11px] leading-relaxed text-slate-200 font-mono whitespace-pre-wrap break-all">
        {value}
      </pre>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="grid place-items-center w-6 h-6 shrink-0 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold">
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-semibold text-white">{title}</p>
        {children}
      </div>
    </div>
  );
}

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs text-slate-400 leading-relaxed">{children}</p>
);
const C = ({ children }: { children: React.ReactNode }) => (
  <code className="px-1 py-0.5 rounded bg-slate-800 text-slate-200 text-[11px]">{children}</code>
);

type Host = "netlify" | "vercel" | "cloudflare" | "github" | "apache" | "nginx";

const HOSTS: { id: Host; label: string }[] = [
  { id: "netlify", label: "Netlify" },
  { id: "cloudflare", label: "Cloudflare Pages" },
  { id: "vercel", label: "Vercel" },
  { id: "github", label: "GitHub Pages" },
  { id: "apache", label: "cPanel / Apache" },
  { id: "nginx", label: "Nginx" },
];

function hostSetup(host: Host, origin: string): { file: string; where: string; code: string } | null {
  const csp = `frame-ancestors ${origin}`;
  switch (host) {
    case "netlify":
    case "cloudflare":
      return {
        file: "_headers",
        where: "Create a file named _headers (no extension) in the same folder as your index.html, paste this, and upload again.",
        code: `/*\n  Content-Security-Policy: ${csp}`,
      };
    case "vercel":
      return {
        file: "vercel.json",
        where: "Create a file named vercel.json in the top folder of your game, paste this, and deploy again.",
        code: `{\n  "headers": [\n    {\n      "source": "/(.*)",\n      "headers": [\n        { "key": "Content-Security-Policy", "value": "${csp}" }\n      ]\n    }\n  ]\n}`,
      };
    case "apache":
      return {
        file: ".htaccess",
        where: "In File Manager, open (or create) the file .htaccess in the same folder as your index.html and paste this at the end.",
        code: `Header always unset X-Frame-Options\nHeader set Content-Security-Policy "${csp}"`,
      };
    case "nginx":
      return {
        file: "nginx site config",
        where: "Inside the server { } block of your site, paste this, then reload Nginx.",
        code: `add_header Content-Security-Policy "${csp}" always;`,
      };
    case "github":
      return null;
  }
}

/** Part heading: ① ② ③ — what is done where. */
function Part({ n, title, who, children }: { n: string; title: string; who: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid place-items-center w-8 h-8 shrink-0 rounded-lg bg-emerald-600 text-white text-sm font-bold">
          {n}
        </span>
        <div className="min-w-0">
          <p className="text-base font-bold text-white">{title}</p>
          <p className="text-xs text-slate-400">{who}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** The listed game websites and their server keys, loaded on demand. */
function ServerKeys() {
  const [sites, setSites] = useState<{ origin: string; key: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/games/websites");
      const d = (await r.json().catch(() => ({}))) as { sites?: { origin: string; key: string }[]; error?: string };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setSites(d.sites ?? []);
    } catch (e) {
      toast.error("Could not load", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };
  if (!sites) {
    return (
      <button
        type="button"
        onClick={load}
        disabled={busy}
        className="rounded-md border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
      >
        {busy ? "Loading…" : "Show my website addresses and server keys"}
      </button>
    );
  }
  if (sites.length === 0) {
    return (
      <div className="rounded-lg bg-red-500/10 border border-red-500/25 p-2.5 text-xs text-red-300">
        No game website is listed yet. Add it first in Games → Settings → Your game websites.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {sites.map((s) => (
        <div key={s.origin} className="space-y-2">
          <CopyBlock label="RevType website address" value={s.origin} />
          <CopyBlock label="RevType server key (secret — server only)" value={s.key} />
        </div>
      ))}
    </div>
  );
}

export function GameSetupGuide({
  gameId,
  onGoToTab,
}: {
  /** null while adding — the id exists once the game is created. */
  gameId: string | null;
  onGoToTab: (tab: "basics" | "embed" | "rewards") => void;
}) {
  const origin = siteOrigin();
  const [host, setHost] = useState<Host>("netlify");
  const idText = gameId ?? "YOUR_GAME_ID";
  const prompt = buildIntegrationPrompt(origin, gameId);

  const serverInstall = `<script src="${origin}/sdk/revtype-games.js"></script>
<script>RevType.init({ gameId: "${idText}", earnBy: "server" });</script>`;

  const playerKeyExample = `RevType.onReady(function (info) {
  if (info.connected && info.playerKey) {
    // your own API — save it with the logged-in player's account
    fetch("/api/revtype/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerKey: info.playerKey })
    });
  }
});`;

  const nodeExample = `// Node.js 18+ — call when a player earned points
const crypto = require("crypto");

async function payOnRevType(playerKey, points, reference) {
  const body = JSON.stringify({
    playerKey,                 // saved when the player connected
    gameId: "${idText}",
    points,                    // whole number, e.g. 50
    reference                  // your unique payout id, e.g. "match-98123"
  });
  const signature = crypto
    .createHmac("sha256", process.env.REVTYPE_SERVER_KEY)
    .update(body)
    .digest("hex");
  const res = await fetch("${origin}/api/games/s2s/credit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-RevType-Site": process.env.REVTYPE_WEBSITE,
      "X-RevType-Signature": signature
    },
    body
  });
  return res.json(); // { ok: true, credited: 50 }
}`;

  const phpExample = `<?php
// PHP — call when a player earned points
function payOnRevType($playerKey, $points, $reference) {
  $body = json_encode([
    "playerKey" => $playerKey,
    "gameId"    => "${idText}",
    "points"    => (int) $points,
    "reference" => $reference
  ]);
  $signature = hash_hmac("sha256", $body, getenv("REVTYPE_SERVER_KEY"));
  $ch = curl_init("${origin}/api/games/s2s/credit");
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $body,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
      "Content-Type: application/json",
      "X-RevType-Site: " . getenv("REVTYPE_WEBSITE"),
      "X-RevType-Signature: " . $signature
    ]
  ]);
  $res = curl_exec($ch);
  curl_close($ch);
  return json_decode($res, true); // ["ok" => true, "credited" => 50]
}`;

  const scoreInstall = `<script src="${origin}/sdk/revtype-games.js"></script>
<script>RevType.init({ gameId: "${idText}" });</script>`;
  const scoreExample = `// Wherever your game gives the player points:
score = score + 10;
if (window.RevType) RevType.setScore(score);`;

  const h = hostSetup(host, origin);

  const ROWS: { what: string; where: string; when: string }[] = [
    { what: "Your game website address", where: "① RevType: Games → Settings → Your game websites  +  ③ your game's admin", when: "Once per website" },
    { what: "Server key (rtgs_…)", where: "③ your game's admin (server settings only)", when: "Once per website" },
    { what: "Game ID", where: "③ your game's admin → RevType Game ID", when: "Every game" },
    { what: "Points conversion (e.g. 100 coins = 1 point)", where: "③ your game's admin", when: "Every game" },
    { what: "RevType code (SDK loader, player link, payOnRevType)", where: "② your game's code", when: "Once per game — by an AI or developer" },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/25 p-3 space-y-1">
        <p className="text-sm font-bold text-white">Connect your game to RevType — three parts</p>
        <P>
          <strong>① In RevType (this page)</strong> you list your website and create the game.{" "}
          <strong>② In your game&apos;s code</strong> the RevType code is added <em>once</em> — easiest by
          giving the ready-made prompt below to your AI. <strong>③ In your game&apos;s admin</strong> you
          paste the Game ID, website address and server key and press Save. Code never goes into an
          admin field — only these values do.
        </P>
      </div>

      {/* What goes where */}
      <div className="rounded-lg border border-slate-800 overflow-hidden">
        <p className="px-3 py-2 text-xs font-semibold text-white bg-slate-900 border-b border-slate-800">
          What goes where
        </p>
        <div className="divide-y divide-slate-800">
          {ROWS.map((r) => (
            <div key={r.what} className="grid gap-1 px-3 py-2 sm:grid-cols-[1.2fr_1.6fr_0.9fr] text-xs">
              <span className="font-semibold text-white">{r.what}</span>
              <span className="text-slate-300">{r.where}</span>
              <span className="text-slate-500">{r.when}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ① RevType */}
      <Part n="1" title="In RevType (here)" who="You — a few clicks">
        <Step n={1} title="List your game website (once for all games)">
          <P>
            Go to <strong>Games → Settings → Your game websites</strong>, add the address your games
            open on (for example <C>https://play.mygames.com</C>) and press <strong>Save websites</strong>.
          </P>
        </Step>
        <Step n={2} title="Create this game">
          <P>
            <TabLink onClick={() => onGoToTab("basics")}>Basics</TabLink> tab: title, icon, category.{" "}
            <TabLink onClick={() => onGoToTab("embed")}>Embed</TabLink> tab: the game&apos;s address on your
            website. Press <strong>Create game</strong>.
          </P>
          <P>
            Your game server decides the income, so leave the score and time options in the{" "}
            <TabLink onClick={() => onGoToTab("rewards")}>Rewards</TabLink> tab <strong>off</strong>.
          </P>
        </Step>
        <Step n={3} title="Copy the three values for your game's admin">
          {gameId ? (
            <CopyBlock label="RevType Game ID" value={gameId} />
          ) : (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 p-2.5 text-xs text-amber-200">
              The Game ID appears here after you press <strong>Create game</strong> and open the game
              again.
            </div>
          )}
          <ServerKeys />
        </Step>
      </Part>

      {/* ② Code */}
      <Part n="2" title="In your game's code — once" who="An AI or a developer — not pasted into any admin">
        <Step n={1} title="Give this prompt to your AI, together with your game's code">
          <P>
            It reads your game first and shows you a plan before changing anything. It adds the RevType
            code AND a &quot;RevType&quot; settings section to your game&apos;s admin with the fields you
            fill in part ③ — so after this, connecting is paste-only.
          </P>
          <CopyBlock label="Prompt for your AI (copy all)" value={prompt} />
        </Step>
        <details className="rounded-lg border border-slate-800 bg-slate-950 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-emerald-400 hover:text-emerald-300">
            For a developer: the code by hand
          </summary>
          <div className="mt-3 space-y-3">
            <P>
              <strong>a.</strong> Game page, just before <C>&lt;/body&gt;</C>:
            </P>
            <CopyBlock label="index.html" value={serverInstall} />
            <P>
              <strong>b.</strong> Game page — send the player&apos;s key to your server once:
            </P>
            <CopyBlock label="Game page" value={playerKeyExample} />
            <P>
              <strong>c.</strong> Game server — call this whenever your server decides a player earned
              points. <C>REVTYPE_SERVER_KEY</C> and <C>REVTYPE_WEBSITE</C> come from part ③. The{" "}
              <C>reference</C> is your own unique id for the payout; the same one never pays twice.
            </P>
            <CopyBlock label="Game server — Node.js" value={nodeExample} />
            <CopyBlock label="Game server — PHP" value={phpExample} />
            <P>
              Answer: <C>{"{ ok: true, credited: 50 }"}</C>. <C>duplicate: true</C> = that reference was
              already paid. <C>capped: true</C> = a daily limit cut it (Games → Settings). 401 = wrong
              server key, 403 = website address not listed.
            </P>
          </div>
        </details>
      </Part>

      {/* ③ Game admin */}
      <Part n="3" title="In your game's admin — paste and Save" who="You — for every game">
        <P>Open your game&apos;s admin → RevType settings (added in part ②) and fill in:</P>
        <div className="rounded-lg border border-slate-800 divide-y divide-slate-800 text-xs">
          {[
            ["RevType enabled", "On"],
            ["RevType Game ID", gameId ? gameId : "the Game ID from part ①, step 3"],
            ["RevType website address", "your website address from part ①, step 3"],
            ["RevType server key", "the server key from part ①, step 3 (starts with rtgs_)"],
            ["Points per game currency", "e.g. 1 RevType point per 100 coins"],
            ["Show RevType button", "On"],
          ].map(([k, v]) => (
            <div key={k} className="grid grid-cols-[1fr_1.4fr] gap-2 px-3 py-2">
              <span className="font-semibold text-white">{k}</span>
              <span className="text-slate-300 break-all">{v}</span>
            </div>
          ))}
        </div>
        <P>
          Press <strong>Save</strong>, then <strong>Test connection</strong>. &quot;Signature OK&quot; means it
          is connected.
        </P>
      </Part>

      <Step n={4} title="Test it">
        <P>
          Open the game on your website, press <strong>Connect RevType</strong>, sign in with a normal member
          account and press <strong>Allow</strong>. Earn something in the game. The points appear in the
          member&apos;s RevType wallet (Wallet → Game earnings) and in Admin → Users → that member → Games.
        </P>
      </Step>

      <details className="rounded-lg border border-slate-800 bg-slate-900 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-white">
          Games WITHOUT a server (score from the browser)
        </summary>
        <div className="mt-3 space-y-2">
          <P>
            Only for simple games that have no server. RevType pays from the score the game reports, limited
            by real play time. In the <TabLink onClick={() => onGoToTab("rewards")}>Rewards</TabLink> tab tick{" "}
            <strong>My own game with the RevType SDK</strong> and <strong>Pay for scores</strong> and set the
            rate. In the game:
          </P>
          <CopyBlock label="index.html — just before </body>" value={scoreInstall} />
          <CopyBlock label="Game code — where the score changes" value={scoreExample} />
        </div>
      </details>

      <details className="rounded-lg border border-slate-800 bg-slate-900 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-white">
          Optional: also show the game inside RevType&apos;s Games page
        </summary>
        <div className="mt-3 space-y-2">
          <P>
            Your host must allow RevType to show the game in a frame. Choose your host:
          </P>
          <div className="flex flex-wrap gap-1.5">
            {HOSTS.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => setHost(x.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${
                  host === x.id
                    ? "bg-emerald-600 border-emerald-600 text-white"
                    : "border-slate-700 text-slate-300 hover:bg-slate-800"
                }`}
              >
                {x.label}
              </button>
            ))}
          </div>
          {h ? (
            <>
              <P>{h.where}</P>
              <CopyBlock label={h.file} value={h.code} />
            </>
          ) : (
            <P>Nothing to do — GitHub Pages already allows it.</P>
          )}
          <P>
            Then press <strong>Test this URL</strong> in the{" "}
            <TabLink onClick={() => onGoToTab("embed")}>Embed</TabLink> tab.
          </P>
        </div>
      </details>

      <div className="rounded-lg bg-slate-900 border border-slate-800 p-3 space-y-1">
        <p className="text-xs font-semibold text-white">How players get paid</p>
        <P>
          Points go straight to the player&apos;s Earn Points on RevType and are withdrawn on RevType&apos;s
          normal Withdraw page (the button on your game links there). One RevType account works for all your
          games. Limits per credit and per player per day: Games → Settings.
        </P>
      </div>
    </div>
  );
}

function TabLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 font-semibold"
    >
      {children}
    </button>
  );
}
