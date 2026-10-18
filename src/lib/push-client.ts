"use client";

import { lsGet, lsSet } from "@/lib/safe-storage";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** True when a subscription was made with this VAPID public key. */
function sameKey(sub: PushSubscription, key: Uint8Array): boolean {
  const k = sub.options?.applicationServerKey;
  if (!k) return true; // browser doesn't say — assume it matches
  const a = new Uint8Array(k);
  if (a.length !== key.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== key[i]) return false;
  return true;
}

/**
 * Register the service worker and subscribe to web-push, then store the
 * subscription on the server. Silently no-ops if unsupported or VAPID is unset.
 * Returns true if the server stored the subscription.
 *
 * Idempotent: an existing subscription is re-sent (the server upserts by
 * endpoint and moves it to the signed-in account), and one made with an old
 * VAPID key is replaced.
 */
export async function subscribeToPush(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;

    const keyRes = await fetch("/api/push/subscribe");
    const { publicKey } = await keyRes.json();
    if (!publicKey) return false; // VAPID not configured server-side
    const key = urlBase64ToUint8Array(publicKey);

    // Reuse the registration ServiceWorkerRegister made; registering again
    // with different options would reset its update-via-cache mode.
    const reg =
      (await navigator.serviceWorker.getRegistration("/")) ??
      (await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }));
    await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub, key)) {
      await sub.unsubscribe().catch(() => false);
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    }

    const json = sub.toJSON();
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const RESUB_KEY = "push_resub_at";
const RESUB_EVERY_MS = 12 * 60 * 60 * 1000;

/**
 * Silent re-subscribe for a member who already allowed notifications: their
 * subscription can be lost without them doing anything (an old service
 * worker, cleared site data, the push service rotating its token, the server
 * pruning a dead endpoint). Runs at most once per 12 h per account on this
 * device; never asks for permission, never shows anything.
 */
export async function resubscribeIfGranted(userId: string): Promise<void> {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const raw = lsGet(RESUB_KEY);
    const [who, at] = (raw ?? "").split("|");
    if (who === userId && Date.now() - Number(at || 0) < RESUB_EVERY_MS) return;
    if (await subscribeToPush()) lsSet(RESUB_KEY, `${userId}|${Date.now()}`);
  } catch {
    /* best effort */
  }
}
