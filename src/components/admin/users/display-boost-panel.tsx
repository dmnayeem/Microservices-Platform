"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  UserPlus,
  MessageSquare,
  Save,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "@/lib/toast";

interface Props {
  userId: string;
  realFollowers: number;
  realFollowing: number;
  realPosts: number;
  initialBoost: {
    followers: number;
    following: number;
    posts: number;
  };
  canEdit: boolean;
}

export function DisplayBoostPanel({
  userId,
  realFollowers,
  realFollowing,
  realPosts,
  initialBoost,
  canEdit,
}: Props) {
  const router = useRouter();
  const [followersBoost, setFollowersBoost] = useState<number>(initialBoost.followers);
  const [followingBoost, setFollowingBoost] = useState<number>(initialBoost.following);
  const [postsBoost, setPostsBoost] = useState<number>(initialBoost.posts);
  const [busy, setBusy] = useState(false);

  const dirty =
    followersBoost !== initialBoost.followers ||
    followingBoost !== initialBoost.following ||
    postsBoost !== initialBoost.posts;

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/display-boost`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayFollowersBoost: followersBoost,
          displayFollowingBoost: followingBoost,
          displayPostsBoost: postsBoost,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Display boost saved");
      router.refresh();
    } catch (err) {
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-white inline-flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            Display Boost
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Vanity offsets shown to other users. Real counts in the database
            stay untouched. Display = max(0, real + boost). Boost can be
            negative to lower the visible count.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <BoostRow
          icon={<Users className="w-4 h-4 text-purple-400" />}
          label="Followers"
          real={realFollowers}
          boost={followersBoost}
          onChange={setFollowersBoost}
          disabled={!canEdit}
        />
        <BoostRow
          icon={<UserPlus className="w-4 h-4 text-emerald-400" />}
          label="Following"
          real={realFollowing}
          boost={followingBoost}
          onChange={setFollowingBoost}
          disabled={!canEdit}
        />
        <BoostRow
          icon={<MessageSquare className="w-4 h-4 text-indigo-400" />}
          label="Posts"
          real={realPosts}
          boost={postsBoost}
          onChange={setPostsBoost}
          disabled={!canEdit}
        />
      </div>

      {canEdit && (
        <div className="flex justify-end pt-2 border-t border-gray-800">
          <button
            onClick={save}
            disabled={busy || !dirty}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-lg disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Boost
          </button>
        </div>
      )}
    </div>
  );
}

function BoostRow({
  icon,
  label,
  real,
  boost,
  onChange,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  real: number;
  boost: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  const display = Math.max(0, real + boost);
  return (
    <div className="rounded-lg bg-gray-950 border border-gray-800 p-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-[110px]">
          {icon}
          <span className="text-sm font-bold text-white">{label}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Real</span>
          <span className="text-sm font-bold text-white tabular-nums px-2 py-1 rounded bg-gray-800 min-w-[3rem] text-center">
            {real.toLocaleString()}
          </span>
        </div>

        <span className="text-gray-600">+</span>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Boost</span>
          <input
            type="number"
            value={boost}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              onChange(Number.isFinite(n) ? n : 0);
            }}
            disabled={disabled}
            placeholder="0"
            className="w-24 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white tabular-nums text-center focus:outline-none focus:border-purple-500 disabled:opacity-50"
          />
        </div>

        <span className="text-gray-600">=</span>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-gray-500">Displayed</span>
          <span className="text-base font-bold text-purple-300 tabular-nums px-3 py-1 rounded bg-purple-500/10 border border-purple-500/30 min-w-[4rem] text-center">
            {display.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
