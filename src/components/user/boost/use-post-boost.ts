"use client";

import { useEffect, useState } from "react";
import type { MemberBoost } from "@/lib/boost-view";

/**
 * The member's own boosts, fetched ONCE per page (shared promise) and looked up
 * per post — a feed or profile full of the owner's posts costs one request, not
 * one per card. Call `refreshMyBoosts()` after creating or cancelling a boost.
 */
type Listener = () => void;
let cache: { at: number; p: Promise<Map<string, MemberBoost>> } | null = null;
const listeners = new Set<Listener>();
const TTL_MS = 60_000;

function load(): Promise<Map<string, MemberBoost>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.p;
  const p = fetch("/api/boosts", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { boosts: [] }))
    .then((d: { boosts?: MemberBoost[] }) => {
      // Newest first from the API — the first row per post is its latest boost.
      const m = new Map<string, MemberBoost>();
      for (const b of d.boosts ?? []) if (b.postId && !m.has(b.postId)) m.set(b.postId, b);
      return m;
    })
    .catch(() => new Map<string, MemberBoost>());
  cache = { at: Date.now(), p };
  return p;
}

export function refreshMyBoosts() {
  cache = null;
  for (const l of listeners) l();
}

/** Latest boost of one of the viewer's own posts (null = never boosted). */
export function usePostBoost(postId: string, enabled: boolean): MemberBoost | null {
  const [boost, setBoost] = useState<MemberBoost | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const run = () => {
      void load().then((m) => alive && setBoost(m.get(postId) ?? null));
    };
    run();
    listeners.add(run);
    return () => {
      alive = false;
      listeners.delete(run);
    };
  }, [postId, enabled]);
  return enabled ? boost : null;
}
