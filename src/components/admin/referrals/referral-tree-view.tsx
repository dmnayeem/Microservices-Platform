"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Users,
  Crown,
  TrendingUp,
  Layers,
  Loader2,
  Search,
  Network,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Avatar } from "@/components/user/primitives/avatar";

interface TreeNode {
  id: string;
  name: string | null;
  email: string;
  avatar: string | null;
  level: number;
  packageTier: string;
  referralCode: string;
  joinedAt: string;
  treeDepth: number;
  childCount: number;
  totalEarned: number;
  children: TreeNode[];
}

interface TreeStats {
  totalDescendants: number;
  totalTreeEarnings: number;
  maxDepth: number;
  byLevel: Record<number, number>;
}

interface UserSummary {
  id: string;
  name: string | null;
  email: string;
  avatar: string | null;
  referralCode: string;
  packageTier: string;
}

interface Props {
  userId: string;
  user: UserSummary;
}

const TIER_DOT: Record<string, string> = {
  FREE: "bg-slate-500",
  STARTER: "bg-blue-500",
  PRO: "bg-indigo-500",
  ELITE: "bg-purple-500",
  VIP: "bg-amber-500",
};

const LEVEL_COLOR: Record<number, string> = {
  0: "border-amber-500/50 bg-amber-500/10",
  1: "border-emerald-500/40 bg-emerald-500/5",
  2: "border-purple-500/40 bg-purple-500/5",
  3: "border-blue-500/40 bg-blue-500/5",
  4: "border-cyan-500/40 bg-cyan-500/5",
  5: "border-pink-500/40 bg-pink-500/5",
  6: "border-orange-500/40 bg-orange-500/5",
  7: "border-red-500/40 bg-red-500/5",
  8: "border-rose-500/40 bg-rose-500/5",
  9: "border-fuchsia-500/40 bg-fuchsia-500/5",
  10: "border-violet-500/40 bg-violet-500/5",
};

export function ReferralTreeView({ userId, user }: Props) {
  const [root, setRoot] = useState<TreeNode | null>(null);
  const [stats, setStats] = useState<TreeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set([userId]));

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/referrals/${userId}/tree`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((d) => {
        setRoot(d.root);
        setStats(d.stats);
      })
      .catch((err) => {
        toast.error("Couldn't load referral tree", {
          description: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    if (!root) return;
    const all = new Set<string>();
    const walk = (n: TreeNode) => {
      all.add(n.id);
      n.children.forEach(walk);
    };
    walk(root);
    setExpanded(all);
  };

  const collapseAll = () => setExpanded(new Set([userId]));

  const matchesSearch = (n: TreeNode): boolean => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (n.name?.toLowerCase().includes(q) ?? false) ||
      n.email.toLowerCase().includes(q) ||
      n.referralCode.toLowerCase().includes(q)
    );
  };

  // If searching: auto-expand all branches that contain a match.
  useEffect(() => {
    if (!root || !search.trim()) return;
    const newExpand = new Set(expanded);
    const visit = (n: TreeNode): boolean => {
      let hasMatch = matchesSearch(n);
      for (const c of n.children) {
        if (visit(c)) hasMatch = true;
      }
      if (hasMatch && n.children.length > 0) newExpand.add(n.id);
      return hasMatch;
    };
    visit(root);
    setExpanded(newExpand);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, root]);

  return (
    <div className="space-y-4">
      <Link
        href="/admin/referrals"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to referrals
      </Link>

      <div className="flex items-start gap-3">
        <Avatar
          src={user.avatar}
          size={48}
          fallbackText={(user.name ?? user.email).charAt(0).toUpperCase()}
          className="rounded-xl shrink-0"
        />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
            <Network className="w-6 h-6 text-purple-400" />
            Referral Tree — {user.name ?? "Unnamed"}
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {user.email} ·{" "}
            <code className="px-1.5 py-0.5 rounded bg-slate-800 text-indigo-400 font-mono text-xs">
              {user.referralCode}
            </code>
          </p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            icon={<Users className="w-5 h-5" />}
            label="Team Size"
            value={stats.totalDescendants.toLocaleString()}
            tone="indigo"
          />
          <Stat
            icon={<Layers className="w-5 h-5" />}
            label="Tree Depth"
            value={`${stats.maxDepth} level${stats.maxDepth === 1 ? "" : "s"}`}
            tone="purple"
          />
          <Stat
            icon={<TrendingUp className="w-5 h-5" />}
            label="Total Earnings"
            value={`$${stats.totalTreeEarnings.toFixed(2)}`}
            tone="emerald"
          />
          <Stat
            icon={<Crown className="w-5 h-5" />}
            label="Top-Level Refs"
            value={(stats.byLevel[1] ?? 0).toLocaleString()}
            tone="amber"
          />
        </div>
      )}

      {/* Per-level breakdown */}
      {stats && stats.maxDepth > 0 && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Members per Level
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-10 gap-2">
            {Array.from({ length: stats.maxDepth }, (_, i) => i + 1).map((lvl) => (
              <div
                key={lvl}
                className={cn(
                  "rounded-lg border p-2 text-center",
                  LEVEL_COLOR[lvl] ?? LEVEL_COLOR[10]
                )}
              >
                <p className="text-[10px] uppercase tracking-wider text-slate-300 font-bold">
                  L{lvl}
                </p>
                <p className="text-sm font-bold text-white tabular-nums mt-0.5">
                  {(stats.byLevel[lvl] ?? 0).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, or code…"
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <button
          onClick={expandAll}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs rounded-lg"
        >
          Expand all
        </button>
        <button
          onClick={collapseAll}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs rounded-lg"
        >
          Collapse all
        </button>
      </div>

      {/* Tree */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading tree…
          </div>
        ) : !root ? (
          <p className="text-center py-12 text-slate-500 text-sm">
            No referral tree found.
          </p>
        ) : (
          <TreeBranch
            node={root}
            expanded={expanded}
            toggle={toggle}
            search={search}
          />
        )}
      </div>
    </div>
  );
}

function TreeBranch({
  node,
  expanded,
  toggle,
  search,
}: {
  node: TreeNode;
  expanded: Set<string>;
  toggle: (id: string) => void;
  search: string;
}) {
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const matches = !search.trim() || nodeMatches(node, search);
  if (!matches && !subtreeHasMatch(node, search)) return null;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg p-2.5 border transition-colors",
          LEVEL_COLOR[node.treeDepth] ?? LEVEL_COLOR[10],
          search.trim() && nodeMatches(node, search) && "ring-1 ring-amber-400"
        )}
      >
        {hasChildren ? (
          <button
            onClick={() => toggle(node.id)}
            className="p-0.5 text-slate-400 hover:text-white shrink-0"
          >
            {isOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}

        <span
          className={cn(
            "px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold shrink-0",
            node.treeDepth === 0
              ? "bg-amber-500/20 text-amber-300"
              : "bg-slate-800 text-slate-300"
          )}
        >
          {node.treeDepth === 0 ? "ROOT" : `L${node.treeDepth}`}
        </span>

        <div className="w-7 h-7 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden">
          {node.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={node.avatar}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            (node.name ?? node.email).charAt(0).toUpperCase()
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/users/${node.id}`}
              className="text-sm font-semibold text-white truncate hover:text-indigo-400 transition-colors"
            >
              {node.name ?? "Unnamed"}
            </Link>
            <span
              className={cn("w-2 h-2 rounded-full", TIER_DOT[node.packageTier] ?? "bg-slate-500")}
              title={node.packageTier}
            />
            <span className="text-[10px] text-slate-500 hidden sm:inline">
              {node.email}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-0.5">
            <code className="font-mono text-indigo-400">{node.referralCode}</code>
            <span>Lv {node.level}</span>
            <span>{format(new Date(node.joinedAt), "MMM yyyy")}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs shrink-0">
          <span
            className="inline-flex items-center gap-0.5 text-slate-300 tabular-nums"
            title="Direct referrals"
          >
            <Users className="w-3.5 h-3.5" />
            {node.childCount}
          </span>
          <span
            className="text-emerald-400 font-semibold tabular-nums"
            title="Earnings credited to this user"
          >
            ${node.totalEarned.toFixed(2)}
          </span>
          <Link
            href={`/admin/referrals/${node.id}`}
            className="text-[10px] text-indigo-400 hover:text-indigo-300 underline"
            title="View this user's tree"
          >
            View tree
          </Link>
        </div>
      </div>

      {hasChildren && isOpen && (
        <div className="mt-1.5 ml-5 pl-3 border-l-2 border-slate-800 space-y-1.5">
          {node.children.map((c) => (
            <TreeBranch
              key={c.id}
              node={c}
              expanded={expanded}
              toggle={toggle}
              search={search}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function nodeMatches(node: TreeNode, search: string): boolean {
  const q = search.toLowerCase();
  return (
    (node.name?.toLowerCase().includes(q) ?? false) ||
    node.email.toLowerCase().includes(q) ||
    node.referralCode.toLowerCase().includes(q)
  );
}

function subtreeHasMatch(node: TreeNode, search: string): boolean {
  if (nodeMatches(node, search)) return true;
  return node.children.some((c) => subtreeHasMatch(c, search));
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "indigo" | "purple" | "emerald" | "amber";
}) {
  const tones = {
    indigo: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  } as const;
  return (
    <div className={cn("rounded-xl border p-4", tones[tone])}>
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-white/5">{icon}</div>
        <div>
          <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
          <p className="text-xs text-slate-400 mt-0.5">{label}</p>
        </div>
      </div>
    </div>
  );
}
