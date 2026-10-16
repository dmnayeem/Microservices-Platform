"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { toast } from "@/lib/toast";

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
  const install = `<script src="${origin}/sdk/revtype-games.js"></script>
<script>RevType.init({ gameId: "${idText}" });</script>`;

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

  <!-- RevType: paste these two lines just before </body> -->
  ${install.replace("\n", "\n  ")}
</body>
</html>`;

  const scoreExample = `// Wherever your game gives the player points:
score = score + 10;
if (window.RevType) RevType.setScore(score);`;

  const addExample = `// Or send each gain instead:
if (window.RevType) RevType.addScore(10);`;

  const extrasExample = `// Optional: hide the built-in button and use your own
//   RevType.init({ gameId: "${idText}", badge: false });
//   myButton.onclick = function () { RevType.connect(); };

// Optional: move the built-in button
//   RevType.init({ gameId: "${idText}", position: "top-left" });

// Optional: react when RevType is ready or credits points
if (window.RevType) {
  RevType.onReady(function (info) {
    // info.connected, info.name, info.points, info.earning
  });
  RevType.onEarn(function (e) {
    // e.awarded = points just credited
  });
}`;

  const h = hostSetup(host, origin);

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/25 p-3 space-y-1">
        <p className="text-sm font-bold text-white">Connect your own HTML5 game to RevType</p>
        <P>
          Your games stay on your own game website. Players there press <strong>Connect RevType</strong>{" "}
          once and sign in (or sign up) to RevType. From then on, the points they earn in your games go
          to their RevType account, and they withdraw them on RevType. Every code box has a Copy button.
        </P>
      </div>

      <Step n={1} title="Put your game online">
        <P>
          Upload your game folder (the one with <C>index.html</C>) to your game website — any host
          works: Netlify, Cloudflare Pages, Vercel, GitHub Pages or your own hosting. It must open with{" "}
          <C>https://</C>. Note the game&apos;s address, for example{" "}
          <C>https://play.mygames.com/space-runner/</C>.
        </P>
      </Step>

      <Step n={2} title="Allow your game website (once for all games)">
        <P>
          Go to <strong>Games → Settings → Your game websites</strong> and add your website&apos;s
          address, for example <C>https://play.mygames.com</C>. Only websites listed there can
          connect to RevType. You do this once — every game on that website then works.
        </P>
      </Step>

      <Step n={3} title="Create the game here">
        <P>
          In the <TabLink onClick={() => onGoToTab("basics")}>Basics</TabLink> tab, enter the title,
          icon image and category. In the <TabLink onClick={() => onGoToTab("embed")}>Embed</TabLink>{" "}
          tab, paste the game&apos;s address from step 1. In the{" "}
          <TabLink onClick={() => onGoToTab("rewards")}>Rewards</TabLink> tab, tick{" "}
          <strong>My own game with the RevType SDK</strong> and <strong>Pay for scores</strong>, and set{" "}
          <strong>RevType points per 1,000 game points</strong>. Press <strong>Create game</strong>.
        </P>
        {!gameId && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 p-2.5 text-xs text-amber-200">
            After you create the game, open it again: this guide then shows the code with your
            game&apos;s ID filled in.
          </div>
        )}
      </Step>

      <Step n={4} title="Install the RevType script in your game">
        <P>
          Open your game&apos;s <C>index.html</C> in any text editor. Find the line <C>&lt;/body&gt;</C>{" "}
          near the bottom and paste these two lines just above it:
        </P>
        {gameId && (
          <P>
            Game ID: <C>{gameId}</C> — already filled in below.
          </P>
        )}
        <CopyBlock label="Paste just before </body> in index.html" value={install} />
        <P>This is how the finished file looks:</P>
        <CopyBlock label="Example index.html" value={indexExample} />
        <P>
          A small <strong>Earn rewards · Connect RevType</strong> button now appears on your game.
          After the player connects, it shows their RevType points and a Withdraw link.
        </P>
      </Step>

      <Step n={5} title="Send the score from your game code">
        <P>
          Open the JavaScript file where your game adds points to the player (search for{" "}
          <C>score</C>). Right after the score changes, add the RevType line:
        </P>
        <CopyBlock label="Send the player's score (recommended)" value={scoreExample} />
        <CopyBlock label="Or send each gain" value={addExample} />
        <P>
          Use one of the two, not both. It is fine if your score goes back to 0 when a new round
          starts — RevType adds up only what the player gains. Points a player earns before
          connecting are kept and sent once they connect. The <C>if (window.RevType)</C> part keeps
          your game working normally if the script can&apos;t load.
        </P>
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-emerald-400 hover:text-emerald-300">
            Optional extras
          </summary>
          <div className="mt-2">
            <CopyBlock label="Optional — your own button, button position, callbacks" value={extrasExample} />
          </div>
        </details>
      </Step>

      <Step n={6} title="Test it">
        <P>
          Open your game on your website, press <strong>Connect RevType</strong>, sign in with a normal
          member account and press <strong>Allow</strong>. Play for 2–3 minutes. The button shows the
          points going up, and they appear in the member&apos;s RevType wallet.
        </P>
      </Step>

      <details className="rounded-lg border border-slate-800 bg-slate-900 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-white">
          Optional: also show the game inside RevType&apos;s Games page
        </summary>
        <div className="mt-3 space-y-2">
          <P>
            The game is also listed on RevType&apos;s own Games page, where members play it without
            connecting. For that, your host must allow RevType to show the game in a frame. Choose your
            host:
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
          Points go straight to the player&apos;s Earn Points on RevType. They withdraw on RevType&apos;s
          normal Withdraw page (the button on your game links there) — nothing else to set up. One
          RevType account works for all your games.
        </P>
        <p className="text-xs font-semibold text-white pt-1">Why the per-minute limit</p>
        <P>
          The game runs in the player&apos;s browser, so a score can be faked. RevType therefore pays at
          most the &quot;Score points per minute&quot; limit (Games → Settings) for each minute it
          measured the game being played, plus the daily limits — a faked score can never earn faster
          than that.
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
