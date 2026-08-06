"use client";

import { useEffect, useState } from "react";
import { Loader2, PlayCircle, Clock, Sparkles, X, CheckCircle2 } from "lucide-react";
import { notifyCenter } from "@/lib/notify-center";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { SandboxedAdFrame } from "@/components/user/primitives/sandboxed-ad-frame";

interface RewardAd {
  id: string;
  title: string;
  format: string;
  imageUrl: string | null;
  html: string | null;
  targetUrl: string | null;
  rewardPoints: number;
  watchSeconds: number;
  cooldownRemaining: number;
}

export function WatchAdsView() {
  const [ads, setAds] = useState<RewardAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<RewardAd | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/earn/watch")
      .then((r) => r.json())
      .then((d) => setAds(d.ads ?? []))
      .catch(() => setAds([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    fetch("/api/earn/watch")
      .then((r) => r.json())
      .then((d) => {
        if (active) {
          setAds(d.ads ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const fmtCooldown = (s: number) => {
    if (s <= 0) return "";
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m` : `${s}s`;
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-400" />
          Watch &amp; Earn
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Watch a sponsored ad for the full duration to earn points.
        </p>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
        </div>
      )}

      {!loading && ads.length === 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center text-sm text-gray-500">
          No reward ads available right now. Check back later.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ads.map((ad) => {
          const onCooldown = ad.cooldownRemaining > 0;
          return (
            <div
              key={ad.id}
              className="rounded-xl border border-gray-800 bg-gray-900 p-3 flex flex-col"
            >
              <div className="relative aspect-video rounded-lg bg-gray-950 border border-gray-800 overflow-hidden flex items-center justify-center">
                {ad.imageUrl ? (
                  <SmartImage
                    src={ad.imageUrl}
                    alt={ad.title}
                    fill
                    sizes="(max-width: 768px) 50vw, 25vw"
                    className="object-cover"
                  />
                ) : (
                  <PlayCircle className="w-10 h-10 text-gray-700" />
                )}
              </div>
              <p className="mt-2 text-sm font-semibold text-white truncate">{ad.title}</p>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-amber-400 font-bold text-sm">+{ad.rewardPoints} pts</span>
                <span className="text-[11px] text-gray-500 inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {ad.watchSeconds}s
                </span>
              </div>
              <button
                disabled={onCooldown}
                onClick={() => setActive(ad)}
                className="mt-3 w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {onCooldown ? (
                  <>Cooldown {fmtCooldown(ad.cooldownRemaining)}</>
                ) : (
                  <>
                    <PlayCircle className="w-4 h-4" />
                    Watch &amp; earn
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {active && (
        <AdWatchModal
          ad={active}
          onClose={() => setActive(null)}
          onRewarded={() => {
            setActive(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function AdWatchModal({
  ad,
  onClose,
  onRewarded,
}: {
  ad: RewardAd;
  onClose: () => void;
  onRewarded: () => void;
}) {
  const [left, setLeft] = useState(Math.max(1, ad.watchSeconds));
  const [claiming, setClaiming] = useState(false);
  const done = left <= 0;

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const claim = async () => {
    setClaiming(true);
    try {
      const res = await fetch(`/api/earn/${ad.id}/claim`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn't claim");
      notifyCenter.reward({
        amount: d.rewarded,
        unit: "pts",
        title: "Reward earned!",
        description: "Thanks for watching 🎬",
      });
      onRewarded();
    } catch (err) {
      notifyCenter.error(
        "Failed",
        err instanceof Error ? err.message : "Try again"
      );
      setClaiming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <p className="text-sm font-semibold text-white truncate">{ad.title}</p>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-gray-950">
          {ad.html ? (
            <div className="w-full p-4">
              <SandboxedAdFrame html={ad.html} height={260} badge={false} />
            </div>
          ) : ad.imageUrl ? (
            <a
              href={ad.targetUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ad.imageUrl} alt={ad.title} className="w-full max-h-[320px] object-contain" />
            </a>
          ) : (
            <div className="min-h-[220px] grid place-items-center text-gray-600">
              <PlayCircle className="w-12 h-12" />
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-800">
          {!done ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300 inline-flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-indigo-400" />
                Keep watching…
              </span>
              <span className="text-white font-mono tabular-nums">{left}s</span>
            </div>
          ) : (
            <button
              onClick={claim}
              disabled={claiming}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold disabled:opacity-50"
            >
              {claiming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Claim +{ad.rewardPoints} pts
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
