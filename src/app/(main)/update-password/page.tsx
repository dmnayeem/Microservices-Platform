"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { toast } from "@/lib/toast";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!current.trim()) {
      toast.error("Enter your current password");
      return;
    }
    if (next.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (next !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Password updated");
      router.push("/profile");
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 max-w-md mx-auto">
      <div>
        <h1 className="text-xl font-bold text-white">🔒 Update Password</h1>
        <p className="text-xs text-(--app-ink-3) mt-1">
          Choose a strong password you don&apos;t use elsewhere.
        </p>
      </div>

      <div className="rounded-xl border border-(--app-line) bg-(--app-surface) p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-(--app-ink-3) mb-1.5">
            Current Password
          </label>
          <div className="relative">
            <input
              type={showCur ? "text" : "password"}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="w-full px-3 py-2 pr-9 bg-(--app-page) border border-(--app-line) rounded-lg text-white text-sm focus:outline-none focus:border-(--app-accent-edge)"
            />
            <button
              onClick={() => setShowCur((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-(--app-ink-3)"
            >
              {showCur ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-(--app-ink-3) mb-1.5">
            New Password
          </label>
          <div className="relative">
            <input
              type={showNew ? "text" : "password"}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="w-full px-3 py-2 pr-9 bg-(--app-page) border border-(--app-line) rounded-lg text-white text-sm focus:outline-none focus:border-(--app-accent-edge)"
            />
            <button
              onClick={() => setShowNew((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-(--app-ink-3)"
            >
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-(--app-ink-3) mb-1.5">
            Confirm New Password
          </label>
          <input
            type={showNew ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-white text-sm focus:outline-none focus:border-(--app-accent-edge)"
          />
        </div>
      </div>

      <button
        disabled={busy}
        onClick={submit}
        className="w-full py-3 rounded-xl bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta) font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
        Update Password
      </button>
    </div>
  );
}
