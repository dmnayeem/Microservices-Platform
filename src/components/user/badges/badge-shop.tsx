"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Check, Coins, Flame, Loader2, Palette, RefreshCw, Sparkles, Wallet } from "lucide-react";
import { Avatar } from "@/components/user/primitives/avatar";
import { VerifiedBadge, badgeRingStyle } from "@/components/user/profile/verified-badge";
import { BADGE_STYLE_KIND, PAID_STYLE_KEYS, styleLabel, type BadgeConfig } from "@/lib/badges";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import { toast } from "@/lib/toast";
import { cn, usd } from "@/lib/utils";

interface ShopData {
  config: BadgeConfig;
  state: {
    active: boolean;
    permanent: boolean;
    expiresAt: string | null;
    autoRenew: boolean;
    currentStyle: string;
    styles: Array<{ style: string; expiresAt: string; autoRenew: boolean; active: boolean }>;
  } | null;
  wallet: { cash: number; points: number; pointsPerUsd: number };
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export function BadgeShop({ name, avatar }: { name: string; avatar: string | null }) {
  const [d, setD] = useState<ShopData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/badges", { cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (r.ok && j) setD(j as ShopData);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const post = async (url: string, body: unknown, key: string, okMsg?: string) => {
    setBusy(key);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Try again");
      if (okMsg) toast.success(okMsg);
      await load();
    } catch (e) {
      toast.error("Not done", { description: e instanceof Error ? e.message : "Try again" });
    } finally {
      setBusy(null);
    }
  };

  if (!d) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-(--app-ink-3)" />
      </div>
    );
  }

  const s = d.state;
  const active = !!s?.active;
  const shown = preview ?? (active ? s!.currentStyle : "BLUE");
  const owned = new Map((s?.styles ?? []).filter((x) => x.active).map((x) => [x.style, x]));
  const pts = (usdAmt: number) => Math.ceil(usdAmt * d.wallet.pointsPerUsd);

  const PayButtons = ({ item, priceUsd, label }: { item: string; priceUsd: number; label: string }) => (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        disabled={!!busy || d.wallet.cash < priceUsd}
        onClick={() => post("/api/badges/buy", { item, method: "CASH" }, `${item}:CASH`, `${label} is yours`)}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-(--app-cta) px-3 py-2.5 text-sm font-bold text-(--app-on-cta) disabled:opacity-50"
        title={d.wallet.cash < priceUsd ? "Not enough cash in your wallet" : undefined}
      >
        {busy === `${item}:CASH` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
        {usd(priceUsd)}
      </button>
      <button
        type="button"
        disabled={!!busy || d.wallet.points < pts(priceUsd)}
        onClick={() => post("/api/badges/buy", { item, method: "POINTS" }, `${item}:POINTS`, `${label} is yours`)}
        className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-(--app-surface-2) px-2 py-2.5 text-xs font-bold text-(--app-ink) disabled:opacity-50"
        title={d.wallet.points < pts(priceUsd) ? "Not enough points" : undefined}
      >
        {busy === `${item}:POINTS` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
        {pts(priceUsd).toLocaleString()} pts
      </button>
    </div>
  );

  const AutoRenew = ({ item, on }: { item: string; on: boolean }) => (
    <button
      type="button"
      disabled={!!busy}
      onClick={() => post("/api/badges/auto-renew", { item, on: !on }, `ar:${item}`)}
      className="inline-flex items-center gap-1.5 text-xs text-(--app-ink-3) hover:text-(--app-ink)"
    >
      <RefreshCw className="h-3.5 w-3.5" />
      Auto-renew {on ? "on" : "off"}
      <span className={cn("relative ml-1 h-4 w-7 rounded-full transition-colors", on ? "bg-emerald-500" : "bg-(--app-surface-2)")}>
        <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all", on ? "left-3.5" : "left-0.5")} />
      </span>
    </button>
  );

  const groups: Array<{ title: string; icon: typeof Flame; keys: string[] }> = [
    { title: "Animated badges", icon: Flame, keys: PAID_STYLE_KEYS.filter((k) => BADGE_STYLE_KIND[k] === "animated") },
    { title: "Premium colours", icon: Palette, keys: PAID_STYLE_KEYS.filter((k) => BADGE_STYLE_KIND[k] === "color") },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Live preview */}
      <section className="relative overflow-hidden rounded-3xl border border-sky-500/30 bg-linear-to-br from-sky-500/15 via-(--app-surface) to-violet-500/10 p-5 sm:p-8">
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
          <span className={cn("relative inline-block shrink-0 rounded-full", badgeRingStyle(shown) && "vb-ring")} style={badgeRingStyle(shown)}>
            <Avatar src={avatar} name={name} size={88} className="ring-2 ring-(--app-surface)" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-400">
              {preview ? "Preview" : active ? "Your badge" : "Get verified"}
            </p>
            <h1 className="mt-1 flex items-center justify-center gap-2 text-2xl font-extrabold text-(--app-ink) sm:justify-start sm:text-3xl">
              <span className="truncate">{name}</span>
              <VerifiedBadge style={shown} size="lg" tooltip={styleLabel(shown)} />
            </h1>
            <p className="mt-2 max-w-xl text-sm text-(--app-ink-2)">
              The blue badge shows next to your name on your profile, posts and comments. Animated styles make it stand
              out — blue fire, aurora, galaxy and more.
            </p>
          </div>
        </div>
      </section>

      {/* The badge itself */}
      <section className="rounded-2xl border border-(--app-line) bg-(--app-surface) p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-500/15 text-sky-400">
              <BadgeCheck className="h-6 w-6" />
            </span>
            <div>
              <p className="text-base font-bold text-(--app-ink)">Blue badge</p>
              {active ? (
                <p className="text-sm text-emerald-400">
                  {s!.permanent ? "Active — granted by RevType, does not expire" : `Active until ${fmtDate(s!.expiresAt!)}`}
                </p>
              ) : (
                <p className="text-sm text-(--app-ink-3)">
                  {usd(d.config.badgePriceUsd)} a month · cancel any time by turning auto-renew off
                </p>
              )}
            </div>
          </div>
          {active && !s!.permanent && <AutoRenew item="badge" on={s!.autoRenew} />}
        </div>
        {!d.config.enabled ? (
          <p className="mt-4 text-sm text-amber-400">The badge shop is closed right now.</p>
        ) : !s?.permanent ? (
          <div className="mt-4 max-w-md">
            <PayButtons item="badge" priceUsd={d.config.badgePriceUsd} label="The blue badge" />
            <p className="mt-2 text-[11px] text-(--app-ink-3)">
              {active ? "Adds another month." : "One month."} Wallet: {usd(d.wallet.cash)} · {d.wallet.points.toLocaleString()} pts.
              Renewals are paid from your cash balance.
            </p>
          </div>
        ) : null}
      </section>

      {/* Styles */}
      {groups.map((g) => (
        <section key={g.title}>
          <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-(--app-ink)">
            <g.icon className="h-4 w-4 text-sky-400" />
            {g.title}
          </h2>
          <p className="mb-3 text-xs text-(--app-ink-3)">
            Monthly, on top of an active blue badge. Tap a card to preview it on your name.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {g.keys.map((k) => {
              const conf = d.config.styles[k];
              if (!conf?.enabled) return null;
              const mine = owned.get(k);
              const inUse = active && s!.currentStyle === k;
              return (
                <div
                  key={k}
                  onMouseEnter={() => setPreview(k)}
                  onMouseLeave={() => setPreview(null)}
                  onClick={() => setPreview(k)}
                  className={cn(
                    "flex flex-col rounded-2xl border bg-(--app-surface) p-4 transition-colors",
                    inUse ? "border-sky-400/60" : "border-(--app-line) hover:border-sky-500/40"
                  )}
                >
                  <div className="grid h-20 place-items-center rounded-xl bg-(--app-page)">
                    <VerifiedBadge style={k} size="lg" tooltip={styleLabel(k)} />
                  </div>
                  <p className="mt-3 flex items-center justify-between text-sm font-bold text-(--app-ink)">
                    {styleLabel(k)}
                    {mine ? (
                      <span className="text-[10px] font-semibold text-emerald-400">Owned</span>
                    ) : (
                      <span className="text-xs text-(--app-ink-3)">{usd(conf.priceUsd)}/mo</span>
                    )}
                  </p>
                  {mine ? (
                    <div className="mt-3 space-y-2">
                      <button
                        type="button"
                        disabled={!!busy || inUse || !active}
                        onClick={(e) => {
                          e.stopPropagation();
                          void post("/api/badges/style", { style: k }, `use:${k}`, `${styleLabel(k)} is on`);
                        }}
                        className={cn(
                          "inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold",
                          inUse ? "bg-emerald-500/15 text-emerald-400" : "bg-(--app-cta) text-(--app-on-cta)"
                        )}
                      >
                        {inUse ? (
                          <>
                            <Check className="h-4 w-4" /> In use
                          </>
                        ) : (
                          "Use this"
                        )}
                      </button>
                      <p className="text-[11px] text-(--app-ink-3)">Until {fmtDate(mine.expiresAt)}</p>
                      <AutoRenew item={k} on={mine.autoRenew} />
                    </div>
                  ) : active ? (
                    <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                      <PayButtons item={k} priceUsd={conf.priceUsd} label={styleLabel(k)} />
                    </div>
                  ) : (
                    <p className="mt-3 text-[11px] text-(--app-ink-3)">Get the blue badge first.</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {active && s!.currentStyle !== "BLUE" && (
        <button
          type="button"
          disabled={!!busy}
          onClick={() => post("/api/badges/style", { style: "BLUE" }, "use:BLUE", "Back to classic blue")}
          className="inline-flex items-center gap-1.5 text-sm text-(--app-ink-3) hover:text-(--app-ink)"
        >
          <Sparkles className="h-4 w-4" /> Switch back to classic blue
        </button>
      )}
    </div>
  );
}
