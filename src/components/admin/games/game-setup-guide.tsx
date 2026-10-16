"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { toast } from "@/lib/toast";

/**
 * Setup guide for connecting a self-built HTML5 game to RevType (owner,
 * 2026-10-17): shown first when adding a game, written for a non-technical
 * admin — every step says which file, where in it, and what to paste.
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

export function GameSetupGuide({
  onGoToTab,
}: {
  onGoToTab: (tab: "basics" | "embed" | "rewards") => void;
}) {
  const origin = siteOrigin();
  const [host, setHost] = useState<Host>("netlify");
  const scriptTag = `<script src="${origin}/sdk/revtype-games.js"></script>`;

  const indexExample = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>My Game</title>
</head>
<body>

  <!-- your game here -->
  <script src="game.js"></script>

  <!-- RevType: paste this line just before </body> -->
  ${scriptTag}
</body>
</html>`;

  const scoreExample = `// Wherever your game gives the player points:
score = score + 10;
if (window.RevType) RevType.setScore(score);`;

  const addExample = `// Or send each gain instead:
if (window.RevType) RevType.addScore(10);`;

  const extrasExample = `// Optional: show a message when the game runs inside RevType
if (window.RevType) {
  RevType.onReady(function (info) {
    if (info.earning) {
      // e.g. show "Earning RevType points" on your start screen
    }
  });

  // Optional: react when RevType credits points
  RevType.onEarn(function (e) {
    // e.awarded = points just credited, e.sessionPoints = total this play
  });
}`;

  const h = hostSetup(host, origin);

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/25 p-3 space-y-1">
        <p className="text-sm font-bold text-white">Connect your own HTML5 game to RevType</p>
        <P>
          Follow these steps once per game. Your game stays on its own website; RevType shows it
          inside the Games page. The game tells RevType the player&apos;s score, and RevType turns it
          into points the player can withdraw. Every code box has a Copy button.
        </P>
      </div>

      <Step n={1} title="Put your game online">
        <P>
          Upload your game folder (the one with <C>index.html</C>) to any web host — for example
          Netlify (drag and drop the folder), Cloudflare Pages, Vercel, GitHub Pages, or your own
          hosting. It must open with <C>https://</C>. Copy the address of the game, for example{" "}
          <C>https://mygames.com/space-runner/</C>. You will paste it in step 5.
        </P>
      </Step>

      <Step n={2} title="Install the RevType script in your game">
        <P>
          Open your game&apos;s <C>index.html</C> in any text editor. Find the line{" "}
          <C>&lt;/body&gt;</C> near the bottom. Paste this line just above it:
        </P>
        <CopyBlock label="Paste just before </body> in index.html" value={scriptTag} />
        <P>This is how the finished file looks:</P>
        <CopyBlock label="Example index.html" value={indexExample} />
      </Step>

      <Step n={3} title="Send the score from your game code">
        <P>
          Open the JavaScript file where your game adds points to the player (search for{" "}
          <C>score</C>). Right after the score changes, add the RevType line:
        </P>
        <CopyBlock label="Send the player's score (recommended)" value={scoreExample} />
        <CopyBlock label="Or send each gain" value={addExample} />
        <P>
          Use one of the two, not both. It is fine if your score goes back to 0 when a new round
          starts — RevType adds up only what the player gains. The <C>if (window.RevType)</C> part
          keeps your game working normally when it is opened outside RevType.
        </P>
        <details className="group">
          <summary className="cursor-pointer text-xs font-semibold text-emerald-400 hover:text-emerald-300">
            Optional extras
          </summary>
          <div className="mt-2">
            <CopyBlock label="Optional — earning message and credit callback" value={extrasExample} />
          </div>
        </details>
      </Step>

      <Step n={4} title="Allow RevType to show your game">
        <P>
          Your host must allow your game to open inside RevType. Choose where your game is hosted:
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
      </Step>

      <Step n={5} title="Add the game here">
        <P>
          In the{" "}
          <TabLink onClick={() => onGoToTab("basics")}>Basics</TabLink> tab, enter the title, icon
          image and category. In the <TabLink onClick={() => onGoToTab("embed")}>Embed</TabLink> tab,
          paste your game&apos;s address from step 1 and press <strong>Test this URL</strong> — it
          must say the game can be shown.
        </P>
      </Step>

      <Step n={6} title="Turn on paying for scores">
        <P>
          In the <TabLink onClick={() => onGoToTab("rewards")}>Rewards</TabLink> tab, tick{" "}
          <strong>My own game with the RevType SDK</strong> and <strong>Pay for scores</strong>, and
          set <strong>RevType points per 1,000 game points</strong>. Then press{" "}
          <strong>Create game</strong>.
        </P>
      </Step>

      <Step n={7} title="Test it">
        <P>
          Log in with a normal member account, open the game from the Games page and play for 2–3
          minutes. The points counter at the top of the player goes up, and the points appear in the
          member&apos;s wallet.
        </P>
      </Step>

      <div className="rounded-lg bg-slate-900 border border-slate-800 p-3 space-y-1">
        <p className="text-xs font-semibold text-white">How players get paid</p>
        <P>
          Points go straight to the player&apos;s Earn Points and are withdrawn through the normal
          Withdraw page — nothing else to set up. Points only count when the game is played inside
          RevType.
        </P>
        <p className="text-xs font-semibold text-white pt-1">Why the per-minute limit</p>
        <P>
          The game runs in the player&apos;s browser, so a score can be faked. RevType therefore pays
          at most the &quot;Score points per minute&quot; limit (Games → Settings) for each minute it
          measured the game being played, plus the daily limits — a faked score can never earn
          faster than that.
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
