"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { Loader2 } from "lucide-react";
import type { SocialAccount } from "./profile-view.types";
import { PLATFORM_META, inp } from "./profile-view.constants";
import { Modal, Field } from "./profile-ui";

export function ConnectSocialModal({
  platform,
  existing,
  onClose,
  onSaved,
}: {
  platform: SocialAccount["platform"];
  existing: SocialAccount | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const meta = PLATFORM_META[platform];
  const [username, setUsername] = useState(existing?.username ?? "");
  const [followers, setFollowers] = useState(existing?.followers ?? 0);
  const [following, setFollowing] = useState(existing?.following ?? 0);
  const [postsCount, setPostsCount] = useState(existing?.postsCount ?? 0);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (username.trim().length < 2) {
      toast.error("Enter your username");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/profile/social-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          username: username.trim(),
          followers,
          following,
          postsCount,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `HTTP ${res.status}`);
      }
      toast.success(existing ? "Updated" : `Connected ${meta.label}`);
      onSaved();
    } catch (err) {
      toast.error("Couldn't save", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      onClose={busy ? undefined : onClose}
      title={`${existing ? "Update" : "Connect"} ${meta.label}`}
      subtitle="Stats are shown on your profile. Admin can verify them later."
    >
      <div className="space-y-3">
        <Field label="Username">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="@yourname"
            className={inp}
          />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label={meta.countLabel}>
            <input
              type="number"
              min={0}
              value={followers}
              onChange={(e) => setFollowers(parseInt(e.target.value) || 0)}
              className={inp}
            />
          </Field>
          <Field label="Following">
            <input
              type="number"
              min={0}
              value={following}
              onChange={(e) => setFollowing(parseInt(e.target.value) || 0)}
              className={inp}
            />
          </Field>
          <Field label="Posts">
            <input
              type="number"
              min={0}
              value={postsCount}
              onChange={(e) => setPostsCount(parseInt(e.target.value) || 0)}
              className={inp}
            />
          </Field>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} disabled={busy} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold rounded-lg disabled:opacity-50"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {existing ? "Save" : "Connect"}
        </button>
      </div>
    </Modal>
  );
}
