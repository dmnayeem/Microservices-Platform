"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Gift,
  Loader2,
  Lock,
  CheckCircle2,
  Clock,
  ExternalLink,
  ArrowLeft,
  Coins,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { ProofImageUpload } from "@/components/user/tasks/proof-image-upload";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";

interface Offer {
  id: string;
  categoryId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  points: number;
  instructions: string[];
  completionMode: string;
  featured: boolean;
  locked: boolean;
  done: boolean;
  pending: boolean;
}
interface Category { id: string; name: string; icon: string | null; color: string | null }
interface Wall { id: string; provider: string; kind: string; url: string }
interface Catalog { categories: Category[]; offers: Offer[]; walls: Wall[]; country: string | null }
interface StartData {
  completionId: string;
  clickId: string;
  trackingUrl: string;
  completionMode: string;
  instructions: string[];
  status: string;
}

export function OfferwallCatalogView() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("");
  const [detail, setDetail] = useState<Offer | null>(null);
  const [start, setStart] = useState<StartData | null>(null);
  const [busy, setBusy] = useState(false);
  const [screenshot, setScreenshot] = useState("");
  const [history, setHistory] = useState<Array<Record<string, unknown>> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/offerwall/catalog");
      const d = await res.json().catch(() => ({}));
      if (res.status === 403 && d.locked) {
        setLocked(d.error ?? "Offerwall isn't enabled for your account.");
        return;
      }
      if (!res.ok) throw new Error(d.error ?? "Failed");
      setCatalog(d);
      const hasOfferWall = (d.walls ?? []).some((w: Wall) => w.kind !== "SURVEY");
      const hasSurveyWall = (d.walls ?? []).some((w: Wall) => w.kind === "SURVEY");
      const first =
        d.categories?.[0]?.id ??
        (hasOfferWall ? "featured" : hasSurveyWall ? "surveys" : "history");
      setTab((prev) => prev || first);
    } catch {
      toast.error("Couldn't load offers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadHistory = async () => {
    const res = await fetch("/api/offerwall/history");
    const d = await res.json().catch(() => ({}));
    setHistory(d.items ?? []);
  };

  const openDetail = (o: Offer) => {
    if (o.locked || o.done) return;
    setDetail(o);
    setStart(null);
    setScreenshot("");
  };

  const doStart = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/offerwall/offers/${detail.id}/start`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn't start");
      setStart(d);
      if (d.trackingUrl) window.open(d.trackingUrl, "_blank", "noopener");
    } catch (e) {
      toast.error("Failed", { description: e instanceof Error ? e.message : "Try again" });
    } finally {
      setBusy(false);
    }
  };

  const submitProof = async () => {
    if (!detail || !start) return;
    if (!screenshot) return toast.error("Upload a screenshot");
    setBusy(true);
    try {
      const res = await fetch(`/api/offerwall/offers/${detail.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completionId: start.completionId, proofImages: [screenshot] }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed");
      toast.success("Proof submitted — pending review");
      setDetail(null);
      load();
    } catch (e) {
      toast.error("Failed", { description: e instanceof Error ? e.message : "Try again" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>;
  }
  if (locked) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center text-sm text-gray-400">{locked}</div>
      </div>
    );
  }
  if (!catalog) return null;

  const catOffers = catalog.offers.filter((o) => o.categoryId === tab);
  const offerWalls = catalog.walls.filter((w) => w.kind !== "SURVEY");
  const surveyWalls = catalog.walls.filter((w) => w.kind === "SURVEY");
  const wallsForTab = tab === "surveys" ? surveyWalls : offerWalls;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Gift className="w-6 h-6 text-emerald-400" />
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-white">Offerwall</h1>
          <p className="text-xs sm:text-sm text-gray-400">Complete offers step-by-step to earn points.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-gray-800 pb-px">
        {offerWalls.length > 0 && (
          <TabBtn active={tab === "featured"} onClick={() => setTab("featured")}>⭐ Featured walls</TabBtn>
        )}
        {surveyWalls.length > 0 && (
          <TabBtn active={tab === "surveys"} onClick={() => setTab("surveys")}>🧪 Surveys</TabBtn>
        )}
        {catalog.categories.map((c) => (
          <TabBtn key={c.id} active={tab === c.id} onClick={() => setTab(c.id)}>
            {c.icon ? `${c.icon} ` : ""}{c.name}
          </TabBtn>
        ))}
        <TabBtn active={tab === "history"} onClick={() => { setTab("history"); loadHistory(); }}>History</TabBtn>
      </div>

      <AdRenderer placement="TASK_LIST" />

      {/* Featured provider walls (offers or surveys) */}
      {(tab === "featured" || tab === "surveys") && (
        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {wallsForTab.map((w) => (
            <a key={w.id} href={w.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-emerald-600/50">
              <div>
                <p className="font-semibold text-white">{w.provider.replace(/_/g, " ")}</p>
                <p className="text-xs text-gray-500">{w.kind === "SURVEY" ? "Surveys" : "Offers"} · opens the partner wall</p>
              </div>
              <ExternalLink className="w-4 h-4 text-emerald-400" />
            </a>
          ))}
        </div>
      )}

      {/* History */}
      {tab === "history" && (
        <div className="space-y-2">
          {history === null ? (
            <div className="grid place-items-center py-8"><Loader2 className="w-5 h-5 animate-spin text-emerald-400" /></div>
          ) : history.length === 0 ? (
            <p className="text-sm text-gray-500">No completions yet.</p>
          ) : history.map((h) => (
            <div key={String(h.id)} className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 p-3">
              <div>
                <p className="text-sm font-medium text-white">{String(h.title)}</p>
                <p className="text-[11px] text-gray-500">{new Date(String(h.createdAt)).toLocaleDateString()}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-emerald-400">+{Number(h.points)} pts</p>
                <p className="text-[11px] text-gray-500">{String(h.status)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Offer cards for a category */}
      {tab !== "featured" && tab !== "surveys" && tab !== "history" && (
        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {catOffers.length === 0 && <p className="text-sm text-gray-500">No offers here yet.</p>}
          {catOffers.map((o) => (
            <button key={o.id} onClick={() => openDetail(o)} disabled={o.locked || o.done}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                o.done ? "border-emerald-600/40 bg-emerald-500/5" :
                o.locked ? "border-gray-800 bg-gray-900/50 opacity-70 cursor-not-allowed" :
                "border-gray-800 bg-gray-900 hover:border-emerald-600/50"}`}>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-gray-800 overflow-hidden">
                {o.imageUrl ? <SmartImage src={o.imageUrl} alt={o.title} width={48} height={48} className="h-12 w-12 object-cover" /> : <Gift className="w-5 h-5 text-emerald-400" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white truncate">{o.title}</p>
                <p className="text-xs text-emerald-400 font-bold inline-flex items-center gap-1"><Coins className="w-3 h-3" /> {o.points} pts</p>
              </div>
              {o.done ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" /> :
               o.pending ? <Clock className="w-5 h-5 text-amber-400 shrink-0" /> :
               o.locked ? <Lock className="w-4 h-4 text-gray-600 shrink-0" /> : null}
            </button>
          ))}
        </div>
      )}

      {/* Offer detail */}
      {detail && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4" onClick={() => setDetail(null)}>
          <div className="mx-auto my-6 w-full max-w-lg rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setDetail(null)} className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white"><ArrowLeft className="w-4 h-4" /> Back</button>
            <div className="flex items-center gap-3">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-gray-800 overflow-hidden">
                {detail.imageUrl ? <SmartImage src={detail.imageUrl} alt={detail.title} width={56} height={56} className="h-14 w-14 object-cover" /> : <Gift className="w-6 h-6 text-emerald-400" />}
              </span>
              <div>
                <h2 className="text-lg font-bold text-white">{detail.title}</h2>
                <p className="text-sm font-bold text-emerald-400 inline-flex items-center gap-1"><Coins className="w-3.5 h-3.5" /> {detail.points} pts</p>
              </div>
            </div>
            {detail.description && <p className="text-sm text-gray-400">{detail.description}</p>}

            {detail.instructions.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">How it works</p>
                <ol className="space-y-1.5">
                  {detail.instructions.map((s, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-300">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-[11px] font-bold text-emerald-400">{i + 1}</span>
                      {s}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {!start ? (
              <button onClick={doStart} disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-linear-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white text-sm font-bold disabled:opacity-50">
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Start Work <ExternalLink className="w-4 h-4" /></>}
              </button>
            ) : (
              <div className="space-y-3">
                <a href={start.trackingUrl || "#"} target="_blank" rel="noopener noreferrer"
                  className={`w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-semibold ${!start.trackingUrl && "pointer-events-none opacity-50"}`}>
                  Reopen the offer <ExternalLink className="w-4 h-4" />
                </a>
                {start.completionMode === "PROOF" ? (
                  <>
                    <p className="text-xs text-gray-400">Finished? Upload a screenshot as proof.</p>
                    <ProofImageUpload value={screenshot} onChange={setScreenshot} />
                    <button onClick={submitProof} disabled={busy || !screenshot}
                      className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50">
                      {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : "Submit proof"}
                    </button>
                  </>
                ) : (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-200">
                    {start.completionMode === "POSTBACK"
                      ? "Complete the offer on the partner site — your points are credited automatically once confirmed."
                      : "Complete the offer — an admin will verify and credit your points."}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
        active ? "border-emerald-500 text-white" : "border-transparent text-gray-400 hover:text-white"}`}>
      {children}
    </button>
  );
}
