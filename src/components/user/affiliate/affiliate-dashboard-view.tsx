"use client";
import { usd } from "@/lib/utils";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "@/lib/toast";
import {
  Handshake,
  Loader2,
  Copy,
  Check,
  Coins,
  TrendingUp,
  Package,
  GraduationCap,
  Eye,
  MousePointerClick,
  Percent,
  BarChart3,
} from "lucide-react";
import { StatCard } from "@/components/user/primitives/stat-card";
import { EmptyState } from "@/components/user/primitives/empty-state";

interface RecentCommission {
  id: string;
  type: "MARKETPLACE" | "COURSE";
  title: string;
  amount: number;
  createdAt: string;
}
interface ItemStat {
  key: string;
  type: "MARKETPLACE" | "COURSE";
  id: string;
  title: string;
  views: number;
  sales: number;
  earned: number;
}
interface Stats {
  views: number;
  clicks: number;
  sales: number;
  earnings: number;
  conversionRate: number;
  byItem: ItemStat[];
  recent: RecentCommission[];
}
interface PromoItem {
  key: string;
  title: string;
  url: string;
  rewardType: "PERCENT" | "FIXED";
  rewardValue: number;
  kind: "Product" | "Course";
}

interface Props {
  joined: boolean;
  programEnabled: boolean;
  code: string;
  stats: Stats | null;
  items: PromoItem[];
  /** When true, joining requires an approved application (not instant). */
  requireApproval?: boolean;
  /** True when the user has a pending AFFILIATE application. */
  pendingApplication?: boolean;
}

export function AffiliateDashboardView({
  joined,
  programEnabled,
  code,
  stats,
  items,
  requireApproval = false,
  pendingApplication = false,
}: Props) {
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const join = async () => {
    setJoining(true);
    try {
      const res = await fetch("/api/affiliate/join", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      toast.success("You're in! Start sharing to earn.");
      router.refresh();
    } catch {
      toast.error("Couldn't join — try again");
    } finally {
      setJoining(false);
    }
  };

  const copyLink = async (item: PromoItem) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}${item.url}?aff=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(item.key);
      toast.success("Affiliate link copied");
      setTimeout(() => setCopied((c) => (c === item.key ? null : c)), 1500);
    } catch {
      toast.error("Copy failed", { description: link });
    }
  };

  const reward = (i: PromoItem) =>
    i.rewardType === "PERCENT" ? `${i.rewardValue}%` : `${usd(i.rewardValue)}`;

  if (!joined) {
    return (
      <div className="max-w-lg mx-auto py-10">
        <div className="glass rounded-2xl p-6 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-(--app-cta)/10 ring-1 ring-(--app-accent-edge)/20 flex items-center justify-center mb-4">
            <Handshake className="w-7 h-7 text-(--app-accent-ink)" />
          </div>
          <h1 className="text-xl font-bold text-white">Affiliate program</h1>
          <p className="text-sm text-(--app-ink-3) mt-1.5">
            Promote marketplace products and courses. When someone buys through
            your link, you earn the reward the seller set — paid straight to your
            wallet.
          </p>
          {!programEnabled ? (
            <p className="mt-4 text-sm text-amber-400">
              The affiliate program is currently closed.
            </p>
          ) : requireApproval ? (
            pendingApplication ? (
              <p className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-amber-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Application pending review
              </p>
            ) : (
              <Link
                href="/profile/become-creator"
                className="mt-5 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-linear-to-r from-(--app-grad-a) to-(--app-grad-b) text-white text-sm font-bold"
              >
                <Handshake className="w-4 h-4" />
                Apply to become an affiliate
              </Link>
            )
          ) : (
            <button
              onClick={join}
              disabled={joining}
              className="mt-5 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-linear-to-r from-(--app-grad-a) to-(--app-grad-b) text-white text-sm font-bold disabled:opacity-60"
            >
              {joining ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Handshake className="w-4 h-4" />
              )}
              Join the program
            </button>
          )}
        </div>
      </div>
    );
  }

  const s = stats ?? {
    views: 0,
    clicks: 0,
    sales: 0,
    earnings: 0,
    conversionRate: 0,
    byItem: [],
    recent: [],
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Handshake className="w-6 h-6 text-(--app-accent-ink)" /> Affiliate
        </h1>
        <p className="text-sm text-(--app-ink-3) mt-0.5">
          Share a product or course link and earn on every sale you drive.
        </p>
      </div>

      {/* Performance overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard icon={<Eye className="w-5 h-5" />} tone="purple" label="Views" value={s.views.toLocaleString()} />
        <StatCard icon={<MousePointerClick className="w-5 h-5" />} tone="blue" label="Clicks" value={s.clicks.toLocaleString()} />
        <StatCard icon={<TrendingUp className="w-5 h-5" />} tone="amber" label="Sales" value={s.sales.toLocaleString()} />
        <StatCard icon={<Coins className="w-5 h-5" />} tone="green" label="Earnings" value={`${usd(s.earnings)}`} />
        <StatCard icon={<Percent className="w-5 h-5" />} tone="pink" label="Conversion" value={`${s.conversionRate.toFixed(1)}%`} />
      </div>
      <p className="text-[11px] text-(--app-ink-3) -mt-2">
        Views = total link opens · Clicks = unique visitors · Conversion = sales ÷ clicks.
      </p>

      {/* Per-item performance */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-white inline-flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-(--app-accent-ink)" /> Performance by link
        </h2>
        {s.byItem.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No activity yet"
            description="Share a link below — views, clicks and sales will show up here per product."
          />
        ) : (
          <div className="glass rounded-xl overflow-hidden">
            <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-4 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-(--app-ink-3) border-b border-(--app-line)/60">
              <span>Item</span>
              <span className="text-right w-14">Views</span>
              <span className="text-right w-14">Sales</span>
              <span className="text-right w-20">Earned</span>
            </div>
            <div className="divide-y divide-(--app-line)/60">
              {s.byItem.map((it) => (
                <div
                  key={it.key}
                  className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-4 gap-y-1 px-4 py-2.5 items-center"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="text-(--app-ink-3) shrink-0">
                      {it.type === "COURSE" ? (
                        <GraduationCap className="w-4 h-4" />
                      ) : (
                        <Package className="w-4 h-4" />
                      )}
                    </span>
                    <span className="text-sm text-white truncate">{it.title}</span>
                  </div>
                  {/* Mobile: inline metrics */}
                  <div className="sm:hidden flex items-center gap-3 text-[11px] tabular-nums justify-end">
                    <span className="text-purple-300">{it.views.toLocaleString()} views</span>
                    <span className="text-amber-300">{it.sales} sold</span>
                    <span className="text-emerald-400 font-bold">{usd(it.earned)}</span>
                  </div>
                  {/* Desktop: columns */}
                  <span className="hidden sm:block text-right w-14 text-sm text-purple-300 tabular-nums">
                    {it.views.toLocaleString()}
                  </span>
                  <span className="hidden sm:block text-right w-14 text-sm text-amber-300 tabular-nums">
                    {it.sales}
                  </span>
                  <span className="hidden sm:block text-right w-20 text-sm font-bold text-emerald-400 tabular-nums">
                    {usd(it.earned)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Promotable catalogue */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-white">Products & courses you can promote</h2>
        {items.length === 0 ? (
          <EmptyState icon={Package} title="Nothing to promote yet" description="Check back when sellers enable affiliate rewards." />
        ) : (
          <div className="space-y-2">
            {items.map((i) => (
              <div key={i.key} className="glass rounded-xl p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-(--app-surface-2) flex items-center justify-center shrink-0 text-(--app-ink-3)">
                  {i.kind === "Course" ? <GraduationCap className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={i.url} className="text-sm font-semibold text-white truncate block hover:text-(--app-accent-ink)">
                    {i.title}
                  </Link>
                  <p className="text-[11px] text-emerald-400 font-bold">Earn {reward(i)} per sale</p>
                </div>
                <button
                  onClick={() => copyLink(i)}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta) text-xs font-bold"
                >
                  {copied === i.key ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied === i.key ? "Copied" : "Copy link"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent earnings */}
      {s.recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white">Recent commissions</h2>
          <div className="glass rounded-xl divide-y divide-(--app-line)/60">
            {s.recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{r.title}</p>
                  <p className="text-[11px] text-(--app-ink-3)">
                    {r.type === "COURSE" ? "Course" : "Product"} ·{" "}
                    {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-sm font-bold text-emerald-400 tabular-nums shrink-0">
                  +{usd(r.amount)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
