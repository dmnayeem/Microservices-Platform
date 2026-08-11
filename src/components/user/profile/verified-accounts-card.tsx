"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { ShieldCheck, CheckCircle2 } from "lucide-react";
import { Card } from "./profile-ui";

interface LinkRow {
  platform: string;
  username: string | null;
  linkedAt: string;
}
interface Config {
  telegramBotUsername: string | null;
  discordEnabled: boolean;
  links: LinkRow[];
}

/**
 * Verified account linking — REAL platform ids (via Telegram Login Widget /
 * Discord OAuth), used to bot-verify JOIN tasks. Distinct from the self-reported
 * "Connected Accounts" card.
 */
export function VerifiedAccountsCard() {
  const [config, setConfig] = useState<Config | null>(null);
  const tgRef = useRef<HTMLDivElement | null>(null);

  const load = () =>
    fetch("/api/integrations/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setConfig(d))
      .catch(() => {});

  useEffect(() => {
    void load();
  }, []);

  // Toast the result of a linking round-trip (?link=telegram&status=ok).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const link = p.get("link");
    const status = p.get("status");
    if (!link) return;
    if (status === "ok") toast.success(`${link} linked`);
    else toast.error(`Couldn't link ${link}`, { description: p.get("reason") ?? undefined });
    // Clean the query so it doesn't re-fire on refresh.
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const tgLinked = config?.links.find((l) => l.platform === "TELEGRAM");
  const dcLinked = config?.links.find((l) => l.platform === "DISCORD");

  // Inject the Telegram Login Widget script once the bot username is known and
  // Telegram isn't already linked.
  useEffect(() => {
    const el = tgRef.current;
    if (!el || !config?.telegramBotUsername || tgLinked) return;
    el.innerHTML = "";
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.setAttribute("data-telegram-login", config.telegramBotUsername.replace(/^@/, ""));
    s.setAttribute("data-size", "medium");
    s.setAttribute("data-request-access", "write");
    s.setAttribute(
      "data-auth-url",
      `${window.location.origin}/api/integrations/telegram/callback`
    );
    el.appendChild(s);
  }, [config?.telegramBotUsername, tgLinked]);

  if (!config) return null;
  // Nothing configured by the admin yet → hide the whole card.
  if (!config.telegramBotUsername && !config.discordEnabled) return null;

  return (
    <Card title="Verified Accounts">
      <p className="text-xs text-gray-400 mb-3 inline-flex items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
        Link your real accounts so JOIN tasks can be auto-verified — no
        screenshots needed.
      </p>
      <div className="space-y-3">
        {config.telegramBotUsername && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-white">📱 Telegram</span>
            {tgLinked ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                Linked{tgLinked.username ? ` · @${tgLinked.username}` : ""}
              </span>
            ) : (
              <div ref={tgRef} />
            )}
          </div>
        )}
        {config.discordEnabled && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-white">🎮 Discord</span>
            {dcLinked ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                Linked{dcLinked.username ? ` · ${dcLinked.username}` : ""}
              </span>
            ) : (
              <a
                href="/api/integrations/discord/start"
                className="px-3 py-1.5 rounded-lg bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-bold"
              >
                Link Discord
              </a>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
