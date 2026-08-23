"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Reorder, useDragControls } from "framer-motion";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Gamepad2,
  X,
  GripVertical,
  BarChart3,
  Star,
  AlertTriangle,
  CheckCircle2,
  Search,
  Tags,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";
import { cn } from "@/lib/utils";
import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { GAME_AD_PLACEMENTS } from "@/lib/ad-placements";
import { ORIENTATIONS } from "@/lib/games-admin";
import { GameCategoriesModal, type AdminGameCategory } from "./game-categories-modal";

export interface AdminGame {
  id: string;
  title: string;
  category: string | null;
  categoryId: string | null;
  description: string | null;
  iconUrl: string;
  coverUrl: string | null;
  embedUrl: string;
  orientation: string;
  isFeatured: boolean;
  order: number;
  isActive: boolean;
  playsCount: number;

  adsEnabled: boolean;
  adOnOpen: boolean;
  adOnResume: boolean;
  adOnQuit: boolean;
  adIntervalSeconds: number;
  adThrottleSeconds: number;
  adPlacement: string;

  rewardEnabled: boolean;
  rewardPointsPerTick: number;
  rewardTickSeconds: number;
  rewardMaxPerSession: number;
  rewardDailyCapPoints: number;
  rewardRequiresAd: boolean;

  scoreRewardEnabled: boolean;
  scoreTrusted: boolean;
  scorePointsPer1000: number;
  scoreDailyCapPoints: number;

  uniquePlayersCount: number;
  totalPlaySeconds: number;
  pointsAwardedTotal: number;
  /** Last framing probe verdict, if one has been run. */
  embedProbe: { ok: boolean; reason?: string; checkedAt?: string } | null;
}

const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500 disabled:opacity-60";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-300 mb-1.5">
        {label}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-slate-500 mt-1">{hint}</span>}
    </label>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex items-start justify-between gap-3 px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer",
        disabled && "opacity-60 cursor-not-allowed"
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm text-white font-medium">{label}</span>
        {hint && <span className="block text-[11px] text-slate-500 mt-0.5">{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 shrink-0 rounded bg-slate-800 border-slate-600 text-emerald-500"
      />
    </label>
  );
}

export function GamesClient({
  initial,
  categories,
  canManage,
}: {
  initial: AdminGame[];
  categories: AdminGameCategory[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [games, setGames] = useState(initial);
  const [modal, setModal] = useState<AdminGame | "new" | null>(null);
  const [catsOpen, setCatsOpen] = useState(false);
  const [q, setQ] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return games.filter(
      (g) =>
        (!needle || g.title.toLowerCase().includes(needle)) &&
        (!filterCat || g.categoryId === filterCat)
    );
  }, [games, q, filterCat]);

  // Dragging only makes sense over the full, unfiltered list — reordering a
  // filtered subset would silently renumber games the admin can't see.
  const canDrag = canManage && !q.trim() && !filterCat;

  const persistOrder = async (next: AdminGame[]) => {
    setGames(next);
    const res = await fetch("/api/admin/games/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.map((g) => g.id) }),
    });
    if (!res.ok) {
      toast.error("Couldn't save the new order");
      router.refresh();
    }
  };

  const del = async (g: AdminGame) => {
    const played = g.uniquePlayersCount > 0 || g.totalPlaySeconds > 0;
    const okToGo = await confirmDialog({
      title: played ? `Hide "${g.title}"?` : `Delete "${g.title}"?`,
      description: played
        ? "People have played this game, so it will be hidden instead of deleted — its earning history is kept."
        : "Nobody has played this game, so it will be deleted permanently.",
      tone: "danger",
      confirmLabel: played ? "Hide" : "Delete",
    });
    if (!okToGo) return;
    setBusyId(g.id);
    try {
      const res = await fetch(`/api/admin/games/${g.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed to delete");
      toast.success(d.message ?? "Game deleted");
      router.refresh();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (g: AdminGame) => {
    setBusyId(g.id);
    try {
      const res = await fetch(`/api/admin/games/${g.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !g.isActive }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setGames((gs) =>
        gs.map((x) => (x.id === g.id ? { ...x, isActive: !x.isActive } : x))
      );
    } catch (err) {
      toast.error("Couldn't change visibility", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-45">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search games…"
            className={cn(inp, "pl-9")}
          />
        </div>
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className={cn(inp, "w-auto")}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id} className="bg-slate-900">
              {c.name}
            </option>
          ))}
        </select>
        {canManage && (
          <>
            <button
              onClick={() => setCatsOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 text-sm"
            >
              <Tags className="w-4 h-4" /> Categories
            </button>
            <button
              onClick={() => setModal("new")}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm"
            >
              <Plus className="w-4 h-4" /> New game
            </button>
          </>
        )}
      </div>

      {!canDrag && canManage && games.length > 1 && (
        <p className="text-[11px] text-slate-500">
          Clear the search and category filter to drag games into a new order.
        </p>
      )}

      {shown.length === 0 ? (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-16 text-center">
          <Gamepad2 className="w-12 h-12 mx-auto mb-4 text-slate-600" />
          <h3 className="text-lg font-medium text-white mb-1">
            {games.length === 0 ? "No games yet" : "Nothing matches"}
          </h3>
          <p className="text-sm text-slate-500">
            {games.length === 0
              ? "Add an embeddable HTML5 game to get started."
              : "Try a different search or category."}
          </p>
        </div>
      ) : (
        <Reorder.Group
          as="div"
          axis="y"
          values={games}
          onReorder={canDrag ? persistOrder : () => {}}
          className="space-y-2"
        >
          {shown.map((g) => (
            <GameRow
              key={g.id}
              game={g}
              categories={categories}
              canManage={canManage}
              canDrag={canDrag}
              busy={busyId === g.id}
              onEdit={() => setModal(g)}
              onDelete={() => del(g)}
              onToggle={() => toggleActive(g)}
            />
          ))}
        </Reorder.Group>
      )}

      {modal && (
        <GameModal
          game={modal === "new" ? null : modal}
          categories={categories}
          onClose={() => setModal(null)}
        />
      )}
      {catsOpen && (
        <GameCategoriesModal
          categories={categories}
          onClose={() => setCatsOpen(false)}
        />
      )}
    </>
  );
}

function GameRow({
  game,
  categories,
  canManage,
  canDrag,
  busy,
  onEdit,
  onDelete,
  onToggle,
}: {
  game: AdminGame;
  categories: AdminGameCategory[];
  canManage: boolean;
  canDrag: boolean;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const controls = useDragControls();
  const catName = categories.find((c) => c.id === game.categoryId)?.name ?? game.category;
  const probeBad = game.embedProbe && game.embedProbe.ok === false;

  return (
    <Reorder.Item
      as="div"
      value={game}
      dragListener={false}
      dragControls={controls}
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800",
        !game.isActive && "opacity-60"
      )}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        onPointerDown={(e) => canDrag && controls.start(e)}
        disabled={!canDrag}
        className="p-1 text-slate-600 hover:text-slate-300 disabled:opacity-30 cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-slate-800 shrink-0">
        <SmartImage src={game.iconUrl} alt={game.title} fill sizes="48px" className="object-cover" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {game.isFeatured && <Star className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
          <p className="text-sm font-bold text-white truncate">{game.title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[11px] text-slate-500">
          {catName && <span className="text-slate-400">{catName}</span>}
          <span className="tabular-nums">
            {game.playsCount.toLocaleString()} plays · {game.uniquePlayersCount} players
          </span>
          {game.rewardEnabled && (
            <span className="text-amber-400">
              {game.rewardPointsPerTick} pts / {game.rewardTickSeconds}s
            </span>
          )}
          {game.adsEnabled ? (
            <span>
              Ads:{" "}
              {[
                game.adOnOpen && "open",
                game.adOnResume && "resume",
                game.adOnQuit && "quit",
                game.adIntervalSeconds > 0 && `${game.adIntervalSeconds}s`,
              ]
                .filter(Boolean)
                .join(" + ") || "none"}
            </span>
          ) : (
            <span>Ads off</span>
          )}
        </div>
        {probeBad && (
          <p className="mt-1 text-[11px] text-red-400 inline-flex items-start gap-1">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            {game.embedProbe?.reason ?? "This game's URL refuses to be embedded."}
          </p>
        )}
      </div>

      <button
        onClick={onToggle}
        disabled={!canManage || busy}
        className={cn(
          "px-2 py-0.5 rounded-full text-xs shrink-0 transition-colors disabled:opacity-50",
          game.isActive
            ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
            : "bg-slate-700 text-slate-400 hover:bg-slate-600"
        )}
      >
        {game.isActive ? "Live" : "Hidden"}
      </button>

      <div className="inline-flex gap-1 shrink-0">
        <Link
          href={`/admin/games/${game.id}/analytics`}
          className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-emerald-400"
          title="Analytics"
        >
          <BarChart3 className="w-4 h-4" />
        </Link>
        {canManage && (
          <>
            <button
              onClick={onEdit}
              className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-blue-400"
              title="Edit"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              disabled={busy}
              className="p-1.5 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-400 disabled:opacity-50"
              title="Delete"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
          </>
        )}
      </div>
    </Reorder.Item>
  );
}

// ── The modal ───────────────────────────────────────────────────────────────

type Tab = "basics" | "embed" | "ads" | "rewards";

const TABS: { id: Tab; label: string }[] = [
  { id: "basics", label: "Basics" },
  { id: "embed", label: "Embed" },
  { id: "ads", label: "Ads" },
  { id: "rewards", label: "Rewards" },
];

function GameModal({
  game,
  categories,
  onClose,
}: {
  game: AdminGame | null;
  categories: AdminGameCategory[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("basics");
  const [busy, setBusy] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<{ ok: boolean; reason?: string } | null>(
    game?.embedProbe ?? null
  );

  const [form, setForm] = useState({
    title: game?.title ?? "",
    categoryId: game?.categoryId ?? "",
    description: game?.description ?? "",
    iconUrl: game?.iconUrl ?? "",
    coverUrl: game?.coverUrl ?? "",
    embedUrl: game?.embedUrl ?? "",
    orientation: game?.orientation ?? "ANY",
    isFeatured: game?.isFeatured ?? false,
    order: game?.order ?? 0,
    isActive: game?.isActive ?? true,

    adsEnabled: game?.adsEnabled ?? true,
    adOnOpen: game?.adOnOpen ?? true,
    adOnResume: game?.adOnResume ?? true,
    adOnQuit: game?.adOnQuit ?? true,
    adIntervalSeconds: game?.adIntervalSeconds ?? 0,
    adThrottleSeconds: game?.adThrottleSeconds ?? 60,
    adPlacement: game?.adPlacement ?? "GAME_INTERSTITIAL",

    rewardEnabled: game?.rewardEnabled ?? false,
    rewardPointsPerTick: game?.rewardPointsPerTick ?? 1,
    rewardTickSeconds: game?.rewardTickSeconds ?? 60,
    rewardMaxPerSession: game?.rewardMaxPerSession ?? 0,
    rewardDailyCapPoints: game?.rewardDailyCapPoints ?? 0,
    rewardRequiresAd: game?.rewardRequiresAd ?? false,

    scoreRewardEnabled: game?.scoreRewardEnabled ?? false,
    scoreTrusted: game?.scoreTrusted ?? false,
    scorePointsPer1000: game?.scorePointsPer1000 ?? 0,
    scoreDailyCapPoints: game?.scoreDailyCapPoints ?? 0,
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const perHour =
    form.rewardTickSeconds > 0
      ? Math.floor((3600 / form.rewardTickSeconds) * form.rewardPointsPerTick)
      : 0;

  const runProbe = async () => {
    if (!form.embedUrl.trim()) {
      toast.error("Enter the game URL first");
      return;
    }
    setProbing(true);
    setProbe(null);
    try {
      const res = await fetch("/api/admin/games/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: form.embedUrl.trim(), gameId: game?.id }),
      });
      const d = await res.json();
      setProbe(d);
    } catch {
      setProbe({ ok: false, reason: "The check itself failed. Try again." });
    } finally {
      setProbing(false);
    }
  };

  const save = async () => {
    if (form.title.trim().length < 2) return toast.error("Title is too short");
    if (!form.iconUrl) return toast.error("Pick a game icon");
    if (!form.embedUrl.trim()) return toast.error("Enter the game URL");

    setBusy(true);
    try {
      const res = await fetch(
        game ? `/api/admin/games/${game.id}` : "/api/admin/games",
        {
          method: game ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            title: form.title.trim(),
            categoryId: form.categoryId || null,
            description: form.description.trim() || null,
            coverUrl: form.coverUrl.trim() || null,
            embedUrl: form.embedUrl.trim(),
          }),
        }
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success(game ? "Game updated" : "Game created");
      onClose();
      router.refresh();
    } catch (err) {
      toast.error("Couldn't save", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-800 w-full max-w-2xl my-8">
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 className="text-lg font-semibold text-white">
            {game ? "Edit game" : "New game"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="flex gap-1 px-3 pt-3 border-b border-slate-800 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors",
                tab === t.id
                  ? "bg-slate-800 text-white border-b-2 border-emerald-500 -mb-px"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/50"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          {tab === "basics" && (
            <>
              <Field label="Title">
                <input
                  value={form.title}
                  onChange={(e) => set({ title: e.target.value })}
                  className={inp}
                  placeholder="Bubble Pop"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Category">
                  <select
                    value={form.categoryId}
                    onChange={(e) => set({ categoryId: e.target.value })}
                    className={inp}
                  >
                    <option value="">— Uncategorised —</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id} className="bg-slate-900">
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Orientation" hint="A hint for the player shell.">
                  <select
                    value={form.orientation}
                    onChange={(e) => set({ orientation: e.target.value })}
                    className={inp}
                  >
                    {ORIENTATIONS.map((o) => (
                      <option key={o} value={o} className="bg-slate-900">
                        {o === "ANY" ? "Any" : o === "PORTRAIT" ? "Portrait" : "Landscape"}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Description">
                <textarea
                  value={form.description}
                  onChange={(e) => set({ description: e.target.value })}
                  rows={2}
                  className={inp}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Icon (square tile)">
                  <ImageUploadField
                    value={form.iconUrl}
                    onChange={(url) => set({ iconUrl: url })}
                    previewSize="square"
                    title="Select game icon"
                  />
                </Field>
                <Field label="Cover (wide, for Featured)">
                  <ImageUploadField
                    value={form.coverUrl}
                    onChange={(url) => set({ coverUrl: url })}
                    title="Select cover art"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Toggle
                  label="Featured"
                  hint="Shown in the big row at the top."
                  checked={form.isFeatured}
                  onChange={(v) => set({ isFeatured: v })}
                />
                <Toggle
                  label="Live"
                  hint="Visible to users."
                  checked={form.isActive}
                  onChange={(v) => set({ isActive: v })}
                />
              </div>
            </>
          )}

          {tab === "embed" && (
            <>
              <Field
                label="Game URL"
                hint="The page that gets loaded in the full-screen frame. Must be https."
              >
                <input
                  value={form.embedUrl}
                  onChange={(e) => {
                    set({ embedUrl: e.target.value });
                    setProbe(null);
                  }}
                  className={inp}
                  placeholder="https://example.com/games/bubble-pop"
                />
              </Field>

              <button
                type="button"
                onClick={runProbe}
                disabled={probing}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 text-sm disabled:opacity-50"
              >
                {probing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Test this URL
              </button>

              {probe && (
                <div
                  className={cn(
                    "rounded-lg border p-3 text-sm",
                    probe.ok
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                      : "bg-red-500/10 border-red-500/30 text-red-300"
                  )}
                >
                  {probe.ok
                    ? "This URL allows being embedded. It should load for players."
                    : probe.reason}
                </div>
              )}

              <p className="text-[11px] text-slate-500">
                A browser can&apos;t detect a site that refuses to be framed —
                the player just sees a black screen and nobody finds out. This
                check reads the site&apos;s headers from the server, where the
                answer is actually visible. It isn&apos;t a guarantee: a game can
                still fail for its own reasons, so the player also shows an
                &ldquo;open in a new tab&rdquo; fallback after 8 seconds.
              </p>

              {form.embedUrl && (
                <div className="rounded-lg border border-slate-800 overflow-hidden bg-black">
                  <p className="px-3 py-1.5 text-[11px] text-slate-400 border-b border-slate-800">
                    Live preview
                  </p>
                  <iframe
                    src={form.embedUrl}
                    title="Game preview"
                    className="w-full h-64 border-0"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  />
                </div>
              )}
            </>
          )}

          {tab === "ads" && (
            <>
              <Toggle
                label="Show ads in this game"
                checked={form.adsEnabled}
                onChange={(v) => set({ adsEnabled: v })}
              />
              <div className="grid grid-cols-3 gap-3">
                <Toggle
                  label="On open"
                  checked={form.adOnOpen}
                  disabled={!form.adsEnabled}
                  onChange={(v) => set({ adOnOpen: v })}
                />
                <Toggle
                  label="On return"
                  checked={form.adOnResume}
                  disabled={!form.adsEnabled}
                  onChange={(v) => set({ adOnResume: v })}
                />
                <Toggle
                  label="On quit"
                  checked={form.adOnQuit}
                  disabled={!form.adsEnabled}
                  onChange={(v) => set({ adOnQuit: v })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Mid-game ad every (seconds)"
                  hint="0 = never interrupt play."
                >
                  <input
                    type="number"
                    min={0}
                    value={form.adIntervalSeconds}
                    disabled={!form.adsEnabled}
                    onChange={(e) =>
                      set({ adIntervalSeconds: Math.max(0, parseInt(e.target.value) || 0) })
                    }
                    className={inp}
                  />
                </Field>
                <Field
                  label="Minimum gap between ads (seconds)"
                  hint="Stops tab-switching from spamming ads."
                >
                  <input
                    type="number"
                    min={10}
                    value={form.adThrottleSeconds}
                    disabled={!form.adsEnabled}
                    onChange={(e) =>
                      set({ adThrottleSeconds: Math.max(10, parseInt(e.target.value) || 60) })
                    }
                    className={inp}
                  />
                </Field>
              </div>
              <Field
                label="Ad slot"
                hint="Only full-screen game slots. Everything else is inventory bought for a different surface."
              >
                <select
                  value={form.adPlacement}
                  disabled={!form.adsEnabled}
                  onChange={(e) => set({ adPlacement: e.target.value })}
                  className={inp}
                >
                  {GAME_AD_PLACEMENTS.map((p) => (
                    <option key={p.name} value={p.name} className="bg-slate-900">
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="text-[11px] text-slate-500">
                How long an ad runs before it can be skipped is set once, per slot,
                in the Ad Manager — not here, so the two can&apos;t disagree.
              </p>
            </>
          )}

          {tab === "rewards" && (
            <>
              <Toggle
                label="Pay points for playing"
                hint="Off by default. Existing games keep paying nothing until you turn this on."
                checked={form.rewardEnabled}
                onChange={(v) => set({ rewardEnabled: v })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Points per interval">
                  <input
                    type="number"
                    min={0}
                    value={form.rewardPointsPerTick}
                    disabled={!form.rewardEnabled}
                    onChange={(e) =>
                      set({ rewardPointsPerTick: Math.max(0, parseInt(e.target.value) || 0) })
                    }
                    className={inp}
                  />
                </Field>
                <Field label="Interval (seconds of play)">
                  <input
                    type="number"
                    min={5}
                    value={form.rewardTickSeconds}
                    disabled={!form.rewardEnabled}
                    onChange={(e) =>
                      set({ rewardTickSeconds: Math.max(5, parseInt(e.target.value) || 60) })
                    }
                    className={inp}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Max per session (0 = no limit)">
                  <input
                    type="number"
                    min={0}
                    value={form.rewardMaxPerSession}
                    disabled={!form.rewardEnabled}
                    onChange={(e) =>
                      set({ rewardMaxPerSession: Math.max(0, parseInt(e.target.value) || 0) })
                    }
                    className={inp}
                  />
                </Field>
                <Field label="Max per day, this game (0 = no limit)">
                  <input
                    type="number"
                    min={0}
                    value={form.rewardDailyCapPoints}
                    disabled={!form.rewardEnabled}
                    onChange={(e) =>
                      set({ rewardDailyCapPoints: Math.max(0, parseInt(e.target.value) || 0) })
                    }
                    className={inp}
                  />
                </Field>
              </div>

              {form.rewardEnabled && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 p-3 text-xs text-amber-200">
                  At this rate one player earns up to{" "}
                  <strong>{perHour.toLocaleString()} points per hour</strong>
                  {form.rewardDailyCapPoints > 0 && (
                    <>
                      , capped at{" "}
                      <strong>{form.rewardDailyCapPoints.toLocaleString()} per day</strong>
                    </>
                  )}
                  . Platform-wide ceilings still apply on top of this, so the real
                  figure can be lower.
                </div>
              )}

              <Toggle
                label="Only pay while ads are being watched"
                hint="Ties payout to the ads that fund it — the count is server-side, so it can't be faked."
                checked={form.rewardRequiresAd}
                disabled={!form.rewardEnabled}
                onChange={(v) => set({ rewardRequiresAd: v })}
              />

              <div className="pt-3 border-t border-slate-800 space-y-3">
                <p className="text-sm font-bold text-white">Score rewards</p>
                <p className="text-[11px] text-slate-500">
                  A score sent by a third-party game is whatever number the player
                  wants it to be. These stay off unless the game is first-party and
                  reports its score through a signed callback.
                </p>
                <Toggle
                  label="This is a trusted first-party game"
                  checked={form.scoreTrusted}
                  onChange={(v) => set({ scoreTrusted: v })}
                />
                <Toggle
                  label="Pay points for score"
                  checked={form.scoreRewardEnabled}
                  disabled={!form.scoreTrusted}
                  onChange={(v) => set({ scoreRewardEnabled: v })}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Points per 1,000 score">
                    <input
                      type="number"
                      min={0}
                      value={form.scorePointsPer1000}
                      disabled={!form.scoreRewardEnabled}
                      onChange={(e) =>
                        set({ scorePointsPer1000: Math.max(0, parseInt(e.target.value) || 0) })
                      }
                      className={inp}
                    />
                  </Field>
                  <Field label="Score points per day (0 = no limit)">
                    <input
                      type="number"
                      min={0}
                      value={form.scoreDailyCapPoints}
                      disabled={!form.scoreRewardEnabled}
                      onChange={(e) =>
                        set({ scoreDailyCapPoints: Math.max(0, parseInt(e.target.value) || 0) })
                      }
                      className={inp}
                    />
                  </Field>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {game ? "Save changes" : "Create game"}
          </button>
        </div>
      </div>
    </div>
  );
}
