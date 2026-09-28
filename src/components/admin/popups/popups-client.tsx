"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Eye, MousePointerClick, Users, Power, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";
import { cn } from "@/lib/utils";
import { mediaSrc } from "@/lib/media-url";
import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";
import { useMediaPicker } from "@/components/admin/shared/use-media-picker";
import { DateField } from "@/components/ui/date-field";
import { TaskAudienceTargeting } from "@/components/admin/tasks/task-audience-targeting";
import { hasAudienceTargeting } from "@/lib/task-targeting";
import {
  POPUP_FREQUENCIES,
  POPUP_FREQUENCY_LABEL,
  POPUP_KINDS,
  POPUP_KIND_LABEL,
  POPUP_PLACEMENTS,
  POPUP_PLACEMENT_LABEL,
  POPUP_SESSION_AUDIENCES,
  POPUP_SESSION_LABEL,
} from "@/lib/popups";

const RichTextEditor = dynamic(
  () => import("@/components/admin/offers/rich-text-editor").then((m) => m.RichTextEditor),
  { ssr: false, loading: () => <div className="h-40 rounded-lg border border-slate-700 bg-slate-950 animate-pulse" /> }
);

export interface PopupRow {
  id: string;
  title: string;
  kind: string;
  body: string | null;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  placement: string;
  paths: string[];
  sessionAudience: string;
  frequency: string;
  delaySeconds: number;
  priority: number;
  isActive: boolean;
  startsAt: string | Date | null;
  endsAt: string | Date | null;
  views: number;
  clicks: number;
  countries: string[];
  genders: string[];
  regions: string[];
  divisions: string[];
  districts: string[];
  subDistricts: string[];
  postalCodes: string[];
  minAge: number | null;
  maxAge: number | null;
  kycAudience: string;
}

const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500";

/** Date → the value a datetime-local input shows, in the admin's own time. */
const toLocalInput = (d: string | Date | null) => {
  if (!d) return "";
  const t = new Date(d);
  return new Date(t.getTime() - t.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

function emptyForm() {
  return {
    title: "",
    kind: "NOTICE",
    body: "",
    imageUrl: "",
    ctaLabel: "",
    ctaUrl: "",
    placement: "ALL",
    paths: "",
    sessionAudience: "ANY",
    frequency: "ONCE",
    delaySeconds: 2,
    priority: 0,
    isActive: true,
    startsAt: "",
    endsAt: "",
    countries: [] as string[],
    genders: [] as string[],
    regions: [] as string[],
    divisions: [] as string[],
    districts: [] as string[],
    subDistricts: [] as string[],
    postalCodes: [] as string[],
    minAge: null as number | null,
    maxAge: null as number | null,
    kycAudience: "ANY",
  };
}
type Form = ReturnType<typeof emptyForm>;

function formOf(p: PopupRow): Form {
  return {
    title: p.title,
    kind: p.kind,
    body: p.body ?? "",
    imageUrl: p.imageUrl ?? "",
    ctaLabel: p.ctaLabel ?? "",
    ctaUrl: p.ctaUrl ?? "",
    placement: p.placement,
    paths: p.paths.join("\n"),
    sessionAudience: p.sessionAudience,
    frequency: p.frequency,
    delaySeconds: p.delaySeconds,
    priority: p.priority,
    isActive: p.isActive,
    startsAt: toLocalInput(p.startsAt),
    endsAt: toLocalInput(p.endsAt),
    countries: p.countries,
    genders: p.genders,
    regions: p.regions,
    divisions: p.divisions,
    districts: p.districts,
    subDistricts: p.subDistricts,
    postalCodes: p.postalCodes,
    minAge: p.minAge,
    maxAge: p.maxAge,
    kycAudience: p.kycAudience,
  };
}

function status(p: PopupRow): { label: string; tone: string } {
  const now = Date.now();
  if (!p.isActive) return { label: "Off", tone: "bg-slate-700 text-slate-300" };
  if (p.startsAt && new Date(p.startsAt).getTime() > now) return { label: "Scheduled", tone: "bg-sky-500/15 text-sky-300" };
  if (p.endsAt && new Date(p.endsAt).getTime() <= now) return { label: "Ended", tone: "bg-slate-700 text-slate-400" };
  return { label: "Live", tone: "bg-emerald-500/15 text-emerald-300" };
}

export function PopupsClient({ initial, canManage }: { initial: PopupRow[]; canManage: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [editing, setEditing] = useState<PopupRow | "new" | null>(null);

  const refresh = async () => {
    const r = await fetch("/api/admin/popups", { cache: "no-store" });
    if (r.ok) setRows((await r.json()).popups);
    router.refresh();
  };

  const toggle = async (p: PopupRow) => {
    const r = await fetch(`/api/admin/popups/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    if (!r.ok) return toast.error("Couldn't change it");
    setRows((rs) => rs.map((x) => (x.id === p.id ? { ...x, isActive: !p.isActive } : x)));
  };

  const remove = async (p: PopupRow) => {
    const ok = await confirmDialog({
      title: `Delete "${p.title}"?`,
      description: "It stops showing immediately. Its view and click counts are kept in the audit log.",
      tone: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    const r = await fetch(`/api/admin/popups/${p.id}`, { method: "DELETE" });
    if (!r.ok) return toast.error("Couldn't delete it");
    setRows((rs) => rs.filter((x) => x.id !== p.id));
    toast.success("Popup deleted");
  };

  return (
    <div className="space-y-4">
      {canManage && (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
        >
          <Plus className="h-4 w-4" /> New popup
        </button>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center text-sm text-slate-400">
          No popups yet. Create one to show a notice, an image or an ad over the site.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const st = status(p);
            const targeted = hasAudienceTargeting(p) || p.kycAudience !== "ANY";
            const ctr = p.views > 0 ? ((p.clicks / p.views) * 100).toFixed(1) : "0.0";
            return (
              <div key={p.id} className="flex flex-col rounded-xl border border-slate-700 bg-slate-900/60 overflow-hidden">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaSrc(p.imageUrl)} alt="" className="h-32 w-full object-cover bg-black" />
                ) : (
                  <div className="h-2 bg-linear-to-r from-blue-600 to-violet-600" />
                )}
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", st.tone)}>{st.label}</span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-300">
                      {POPUP_KIND_LABEL[p.kind as keyof typeof POPUP_KIND_LABEL] ?? p.kind}
                    </span>
                    {targeted && (
                      <span className="inline-flex items-center gap-1 rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-violet-300">
                        <Users className="h-3 w-3" /> Targeted
                      </span>
                    )}
                  </div>
                  <p className="font-semibold text-white leading-snug">{p.title}</p>
                  <p className="text-xs text-slate-400">
                    {POPUP_PLACEMENT_LABEL[p.placement as keyof typeof POPUP_PLACEMENT_LABEL] ?? p.placement}
                    {" · "}
                    {POPUP_FREQUENCY_LABEL[p.frequency as keyof typeof POPUP_FREQUENCY_LABEL] ?? p.frequency}
                  </p>
                  <div className="mt-auto grid grid-cols-3 gap-2 pt-2 text-center">
                    <div className="rounded-lg bg-slate-950 py-1.5">
                      <p className="text-sm font-bold text-white tabular-nums">{p.views.toLocaleString()}</p>
                      <p className="text-[10px] text-slate-400 inline-flex items-center gap-1"><Eye className="h-3 w-3" />Views</p>
                    </div>
                    <div className="rounded-lg bg-slate-950 py-1.5">
                      <p className="text-sm font-bold text-white tabular-nums">{p.clicks.toLocaleString()}</p>
                      <p className="text-[10px] text-slate-400 inline-flex items-center gap-1"><MousePointerClick className="h-3 w-3" />Clicks</p>
                    </div>
                    <div className="rounded-lg bg-slate-950 py-1.5">
                      <p className="text-sm font-bold text-white tabular-nums">{ctr}%</p>
                      <p className="text-[10px] text-slate-400">CTR</p>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => setEditing(p)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-800 py-2 text-xs font-semibold text-white hover:bg-slate-700">
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button type="button" onClick={() => toggle(p)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-800 py-2 text-xs font-semibold text-white hover:bg-slate-700">
                        <Power className="h-3.5 w-3.5" /> {p.isActive ? "Turn off" : "Turn on"}
                      </button>
                      <button type="button" onClick={() => remove(p)} aria-label="Delete" className="rounded-lg bg-slate-800 px-3 text-red-300 hover:bg-red-500/20">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <PopupEditor
          popup={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-400">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

function PopupEditor({
  popup,
  onClose,
  onSaved,
}: {
  popup: PopupRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Form>(popup ? formOf(popup) : emptyForm());
  const [busy, setBusy] = useState(false);
  const { pick, picker } = useMediaPicker("Select popup image");
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (form.title.trim().length < 2) return toast.error("Give the popup a title");
    if (form.kind === "IMAGE" && !form.imageUrl) return toast.error("An image popup needs an image");
    if (form.placement === "PATHS" && !form.paths.trim()) return toast.error("List at least one page, e.g. /wallet");
    if ((form.ctaLabel && !form.ctaUrl) || (!form.ctaLabel && form.ctaUrl && form.kind !== "IMAGE")) {
      return toast.error("A button needs both a label and a link");
    }
    setBusy(true);
    try {
      const res = await fetch(popup ? `/api/admin/popups/${popup.id}` : "/api/admin/popups", {
        method: popup ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          delaySeconds: Number(form.delaySeconds) || 0,
          priority: Number(form.priority) || 0,
          startsAt: fromLocalInput(form.startsAt),
          endsAt: fromLocalInput(form.endsAt),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success(popup ? "Popup saved" : "Popup created");
      onSaved();
    } catch (e) {
      toast.error("Couldn't save", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-2 sm:p-6">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="sticky top-0 z-20 flex items-center justify-between rounded-t-2xl border-b border-slate-800 bg-slate-900 px-4 py-3">
          <h2 className="font-bold text-white">{popup ? "Edit popup" : "New popup"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-4">
          <section className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title">
                <input value={form.title} onChange={(e) => set("title", e.target.value)} className={inp} placeholder="Eid bonus: double points this week!" maxLength={120} />
              </Field>
              <Field label="Type" hint="Image = a picture that is the whole popup (the link makes it clickable). Ad = shows a “Sponsored” label.">
                <select value={form.kind} onChange={(e) => set("kind", e.target.value)} className={inp}>
                  {POPUP_KINDS.map((k) => <option key={k} value={k}>{POPUP_KIND_LABEL[k]}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Image (optional for a notice)">
              <ImageUploadField value={form.imageUrl} onChange={(url) => set("imageUrl", url)} title="Select popup image" />
            </Field>
            {form.kind !== "IMAGE" && (
              <Field label="Message">
                <RichTextEditor value={form.body} onChange={(html) => set("body", html)} onPickImage={pick} minHeightClass="min-h-32" placeholder="Write the notice…" />
              </Field>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={form.kind === "IMAGE" ? "Button label (optional)" : "Button label"}>
                <input value={form.ctaLabel} onChange={(e) => set("ctaLabel", e.target.value)} className={inp} placeholder="Claim now" maxLength={40} />
              </Field>
              <Field label="Button / image link" hint="A page on the site (/lottery) or a full https:// link.">
                <input value={form.ctaUrl} onChange={(e) => set("ctaUrl", e.target.value)} className={inp} placeholder="/lottery  or  https://…" />
              </Field>
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/40 p-3">
            <p className="text-sm font-semibold text-white">Where and how often</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Show on">
                <select value={form.placement} onChange={(e) => set("placement", e.target.value)} className={inp}>
                  {POPUP_PLACEMENTS.map((k) => <option key={k} value={k}>{POPUP_PLACEMENT_LABEL[k]}</option>)}
                </select>
              </Field>
              <Field label="Show to">
                <select value={form.sessionAudience} onChange={(e) => set("sessionAudience", e.target.value)} className={inp}>
                  {POPUP_SESSION_AUDIENCES.map((k) => <option key={k} value={k}>{POPUP_SESSION_LABEL[k]}</option>)}
                </select>
              </Field>
            </div>
            {form.placement === "PATHS" && (
              <Field label="Pages" hint="One per line. /wallet also covers /wallet/anything. Use / for the home page only.">
                <textarea value={form.paths} onChange={(e) => set("paths", e.target.value)} className={cn(inp, "min-h-20 font-mono")} placeholder={"/social\n/wallet"} />
              </Field>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="How often">
                <select value={form.frequency} onChange={(e) => set("frequency", e.target.value)} className={inp}>
                  {POPUP_FREQUENCIES.map((k) => <option key={k} value={k}>{POPUP_FREQUENCY_LABEL[k]}</option>)}
                </select>
              </Field>
              <Field label="Delay (seconds)">
                <input type="number" min={0} max={60} value={form.delaySeconds} onChange={(e) => set("delaySeconds", Number(e.target.value))} className={inp} />
              </Field>
              <Field label="Priority" hint="Higher shows first when several match.">
                <input type="number" min={-100} max={100} value={form.priority} onChange={(e) => set("priority", Number(e.target.value))} className={inp} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Starts (optional)">
                <DateField type="datetime-local" value={form.startsAt} onChange={(v) => set("startsAt", v)} className={inp} />
              </Field>
              <Field label="Ends (optional)">
                <DateField type="datetime-local" value={form.endsAt} onChange={(v) => set("endsAt", v)} className={inp} />
              </Field>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} className="h-4 w-4" />
              Active
            </label>
          </section>

          <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/40 p-3">
            <div>
              <p className="text-sm font-semibold text-white">Who sees it</p>
              <p className="text-xs text-slate-400">
                Leave everything empty for everyone. A person must match every rule you set. Visitors
                who are not signed in are matched by the country of their connection only.
              </p>
            </div>
            <Field label="KYC status">
              <select value={form.kycAudience} onChange={(e) => set("kycAudience", e.target.value)} className={inp}>
                <option value="ANY">Everyone</option>
                <option value="VERIFIED">Only KYC-verified users</option>
                <option value="NOT_VERIFIED">Only users who have not done KYC</option>
              </select>
            </Field>
            <TaskAudienceTargeting value={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />
          </section>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 rounded-b-2xl border-t border-slate-800 bg-slate-900 px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50">
            {busy ? "Saving…" : popup ? "Save changes" : "Create popup"}
          </button>
        </div>
      </div>
      {picker}
    </div>
  );
}
