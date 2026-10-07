"use client";

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  MousePointerClick,
  Users,
  Power,
  X,
  Smartphone,
  Monitor,
  Upload,
  Loader2,
  Search,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";
import { cn } from "@/lib/utils";
import { mediaSrc } from "@/lib/media-url";
import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";
import { useMediaPicker } from "@/components/admin/shared/use-media-picker";
import { DateField } from "@/components/ui/date-field";
import { TaskAudienceTargeting } from "@/components/admin/tasks/task-audience-targeting";
import { hasAudienceTargeting } from "@/lib/task-targeting";
import { USER_PAGES } from "@/lib/page-visibility";
import { resolveVideoUrl } from "@/lib/video-url";
import { PopupCard } from "@/components/popups/popup-card";
import {
  POPUP_DEVICES,
  POPUP_DEVICE_LABEL,
  POPUP_FREQUENCIES,
  POPUP_FREQUENCY_LABEL,
  POPUP_KINDS,
  POPUP_KIND_LABEL,
  POPUP_PLACEMENTS,
  POPUP_PLACEMENT_LABEL,
  POPUP_PLAN_AUDIENCES,
  POPUP_PLAN_AUDIENCE_LABEL,
  POPUP_SESSION_AUDIENCES,
  POPUP_SESSION_LABEL,
  POPUP_SIZES,
  POPUP_SIZE_LABEL,
  sanitizePopupKind,
  sanitizePopupSize,
  type PopupVideo,
  type PopupView,
} from "@/lib/popups";

const RichTextEditor = dynamic(
  () => import("@/components/admin/offers/rich-text-editor").then((m) => m.RichTextEditor),
  { ssr: false, loading: () => <div className="h-40 rounded-lg border border-slate-700 bg-slate-950 animate-pulse" /> }
);

/** Short names for the list cards (the editor shows the long ones). */
const KIND_SHORT: Record<string, string> = {
  NOTICE: "Notice",
  IMAGE: "Image",
  VIDEO: "Video",
  HTML: "HTML",
  AD: "Ad",
};

/** Public pages a popup can also target (signed-in pages come from USER_PAGES). */
const SITE_PAGES = [
  { path: "/", label: "Home page (landing)", group: "Website" },
  { path: "/pricing", label: "Pricing", group: "Website" },
  { path: "/blog", label: "Blog", group: "Website" },
  { path: "/marketplace", label: "Marketplace", group: "Website" },
  { path: "/courses", label: "Courses", group: "Website" },
  { path: "/login", label: "Login", group: "Website" },
  { path: "/register", label: "Sign up", group: "Website" },
];

export interface PopupRow {
  id: string;
  title: string;
  kind: string;
  body: string | null;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  cta2Label: string | null;
  cta2Url: string | null;
  videos: string[];
  htmlCode: string | null;
  htmlHeight: number;
  size: string;
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
  planAudience: string;
  packageIds: string[];
  minLevel: number | null;
  maxLevel: number | null;
  minAccountDays: number | null;
  maxAccountDays: number | null;
  devices: string[];
}

export interface PackageOption {
  id: string;
  name: string;
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
const numOrNull = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.floor(Number(v)) || 0));

function emptyForm() {
  return {
    title: "",
    kind: "NOTICE",
    body: "",
    imageUrl: "",
    ctaLabel: "",
    ctaUrl: "",
    cta2Label: "",
    cta2Url: "",
    videos: [] as string[],
    htmlCode: "",
    htmlHeight: 320,
    size: "MEDIUM",
    placement: "ALL",
    paths: [] as string[],
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
    planAudience: "ANY",
    packageIds: [] as string[],
    minLevel: null as number | null,
    maxLevel: null as number | null,
    minAccountDays: null as number | null,
    maxAccountDays: null as number | null,
    devices: [] as string[],
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
    cta2Label: p.cta2Label ?? "",
    cta2Url: p.cta2Url ?? "",
    videos: p.videos ?? [],
    htmlCode: p.htmlCode ?? "",
    htmlHeight: p.htmlHeight ?? 320,
    size: p.size ?? "MEDIUM",
    placement: p.placement,
    paths: p.paths,
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
    planAudience: p.planAudience ?? "ANY",
    packageIds: p.packageIds ?? [],
    minLevel: p.minLevel ?? null,
    maxLevel: p.maxLevel ?? null,
    minAccountDays: p.minAccountDays ?? null,
    maxAccountDays: p.maxAccountDays ?? null,
    devices: p.devices ?? [],
  };
}

/** True when any of the newer audience rules is set (for the list badge). */
function hasExtraTargeting(p: PopupRow): boolean {
  return (
    (p.planAudience ?? "ANY") !== "ANY" ||
    (p.packageIds?.length ?? 0) > 0 ||
    p.minLevel != null ||
    p.maxLevel != null ||
    p.minAccountDays != null ||
    p.maxAccountDays != null ||
    (p.devices?.length ?? 0) > 0
  );
}

function status(p: PopupRow): { label: string; tone: string } {
  const now = Date.now();
  if (!p.isActive) return { label: "Off", tone: "bg-slate-700 text-slate-300" };
  if (p.startsAt && new Date(p.startsAt).getTime() > now) return { label: "Scheduled", tone: "bg-sky-500/15 text-sky-300" };
  if (p.endsAt && new Date(p.endsAt).getTime() <= now) return { label: "Ended", tone: "bg-slate-700 text-slate-400" };
  return { label: "Live", tone: "bg-emerald-500/15 text-emerald-300" };
}

export function PopupsClient({
  initial,
  canManage,
  packages = [],
}: {
  initial: PopupRow[];
  canManage: boolean;
  packages?: PackageOption[];
}) {
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
          No popups yet. Create one to show a notice, an image, a video, HTML/ad code or an offer over the site.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const st = status(p);
            const targeted = hasAudienceTargeting(p) || p.kycAudience !== "ANY" || hasExtraTargeting(p);
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
                      {KIND_SHORT[p.kind] ?? p.kind}
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
          packages={packages}
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

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/40 p-3 sm:p-4">
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
        on ? "border-blue-500 bg-blue-500/20 text-blue-200" : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
      )}
    >
      {children}
    </button>
  );
}

const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** Pick pages from the list, or type any other path. */
function PagePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState("");
  const [custom, setCustom] = useState("");
  const pages = useMemo(() => [...SITE_PAGES, ...USER_PAGES], []);
  const shown = pages.filter((p) => !q || p.label.toLowerCase().includes(q.toLowerCase()) || p.path.includes(q.toLowerCase()));
  const groups = [...new Set(shown.map((p) => p.group))];
  const known = new Set(pages.map((p) => p.path));
  const extras = value.filter((v) => !known.has(v));
  const addCustom = () => {
    const v = custom.trim();
    if (!v.startsWith("/")) return toast.error("A page path starts with /, e.g. /wallet");
    onChange([...new Set([...value, v])]);
    setCustom("");
  };
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages…" className={cn(inp, "pl-9")} />
      </div>
      <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-slate-800 p-2">
        {groups.map((g) => (
          <div key={g}>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{g}</p>
            <div className="flex flex-wrap gap-1.5">
              {shown
                .filter((p) => p.group === g)
                .map((p) => (
                  <Chip key={p.path} on={value.includes(p.path)} onClick={() => onChange(toggleIn(value, p.path))}>
                    {p.label}
                  </Chip>
                ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustom())}
          placeholder="Other page, e.g. /offer/eid"
          className={cn(inp, "font-mono")}
        />
        <button type="button" onClick={addCustom} className="rounded-lg bg-slate-800 px-3 text-sm font-semibold text-white hover:bg-slate-700">
          Add
        </button>
      </div>
      {extras.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {extras.map((v) => (
            <Chip key={v} on onClick={() => onChange(value.filter((x) => x !== v))}>
              {v} ✕
            </Chip>
          ))}
        </div>
      )}
      <p className="text-[11px] text-slate-500">
        {value.length} page{value.length === 1 ? "" : "s"} selected. A page also covers everything under it
        (/wallet covers /wallet/history).
      </p>
    </div>
  );
}

/** Video links: add a link (YouTube, Vimeo, .mp4) or upload a file. */
function VideoList({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [link, setLink] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const add = (url: string) => {
    const u = url.trim();
    if (!u) return;
    if (value.length >= 10) return toast.error("At most 10 videos");
    if (resolveVideoUrl(u).kind === "unknown") return toast.error("Not a video link", { description: "Use a YouTube or Vimeo link, or a direct .mp4 / .webm file." });
    onChange([...value, u]);
    setLink("");
  };
  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "posts");
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) throw new Error(d.error || "Upload failed");
      onChange([...value, d.url]);
      toast.success("Video uploaded");
    } catch (e) {
      toast.error("Couldn't upload the video", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="space-y-2">
      {value.map((v, i) => (
        <div key={`${v}-${i}`} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
          <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-300">{v}</span>
          <button type="button" onClick={() => onChange(value.filter((_, n) => n !== i))} aria-label="Remove video" className="text-red-300 hover:text-red-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add(link))}
          placeholder="https://youtube.com/watch?v=…  or  https://…/video.mp4"
          className={inp}
        />
        <div className="flex gap-2">
          <button type="button" onClick={() => add(link)} className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Add link
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>
      <p className="text-[11px] text-slate-500">Several videos = the viewer switches between them with buttons under the player.</p>
    </div>
  );
}

/** The form as the viewer would receive it — for the live preview. */
function previewOf(form: Form): PopupView {
  const videos: PopupVideo[] = form.videos
    .map((u): PopupVideo | null => {
      const src = mediaSrc(u);
      const r = resolveVideoUrl(src);
      if (r.kind === "youtube" || r.kind === "vimeo" || r.kind === "iframe") return { kind: "embed", src: r.embedUrl };
      if (r.kind === "file") return { kind: "file", src, mime: r.mime };
      return null;
    })
    .filter((v): v is PopupVideo => !!v);
  const kind = sanitizePopupKind(form.kind);
  return {
    id: "preview",
    title: form.title || "Popup title",
    kind,
    body: form.body || null,
    imageUrl: form.imageUrl || null,
    ctaLabel: form.ctaLabel || null,
    ctaUrl: form.ctaUrl || null,
    cta2Label: form.cta2Label || null,
    cta2Url: form.cta2Url || null,
    videos: kind === "VIDEO" ? videos : [],
    htmlCode: kind === "HTML" ? form.htmlCode || null : null,
    htmlHeight: form.htmlHeight || 320,
    size: sanitizePopupSize(form.size),
    frequency: "ALWAYS",
    delaySeconds: 0,
    version: "preview",
  };
}

function Preview({ form }: { form: Form }) {
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const view = previewOf(form);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-300">Live preview</p>
        <div className="flex rounded-lg border border-slate-700 p-0.5">
          {(["mobile", "desktop"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDevice(d)}
              aria-label={d}
              className={cn("rounded-md p-1.5", device === d ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white")}
            >
              {d === "mobile" ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
            </button>
          ))}
        </div>
      </div>
      <div
        className={cn(
          "mx-auto flex items-center justify-center overflow-hidden rounded-2xl border border-slate-700 bg-[radial-gradient(circle_at_30%_20%,#334155,#0f172a)] p-3",
          device === "mobile" ? "h-[560px] w-[300px]" : "h-[440px] w-full"
        )}
      >
        <div className={cn("flex max-h-full w-full justify-center", device === "mobile" ? "max-w-[276px]" : "")}>
          <PopupCard popup={view} onClose={() => {}} inline />
        </div>
      </div>
      <p className="text-[11px] text-slate-500">The close (✕) button is always in the top-right corner.</p>
    </div>
  );
}

function PopupEditor({
  popup,
  packages,
  onClose,
  onSaved,
}: {
  popup: PopupRow | null;
  packages: PackageOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Form>(popup ? formOf(popup) : emptyForm());
  const [busy, setBusy] = useState(false);
  const { pick, picker } = useMediaPicker("Select popup image");
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const kind = form.kind;

  const save = async () => {
    if (form.title.trim().length < 2) return toast.error("Give the popup a title");
    if (kind === "IMAGE" && !form.imageUrl) return toast.error("An image popup needs an image");
    if (kind === "VIDEO" && form.videos.length === 0) return toast.error("Add at least one video");
    if (kind === "HTML" && !form.htmlCode.trim()) return toast.error("Paste the HTML / ad code");
    if (form.placement === "PATHS" && form.paths.length === 0) return toast.error("Pick at least one page");
    if ((form.ctaLabel && !form.ctaUrl) || (!form.ctaLabel && form.ctaUrl && kind !== "IMAGE")) {
      return toast.error("The first button needs both a label and a link");
    }
    if (!!form.cta2Label !== !!form.cta2Url) return toast.error("The second button needs both a label and a link");
    if (form.minLevel != null && form.maxLevel != null && form.minLevel > form.maxLevel) return toast.error("Min level is above max level");
    if (form.minAccountDays != null && form.maxAccountDays != null && form.minAccountDays > form.maxAccountDays) {
      return toast.error("The account-age range is upside down");
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
          htmlHeight: Number(form.htmlHeight) || 320,
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

  const numInput = (k: "minLevel" | "maxLevel" | "minAccountDays" | "maxAccountDays", placeholder: string) => (
    <input
      type="number"
      min={0}
      value={form[k] ?? ""}
      onChange={(e) => set(k, numOrNull(e.target.value))}
      placeholder={placeholder}
      className={inp}
    />
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-2 sm:p-6">
      <div className="w-full max-w-6xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="sticky top-0 z-20 flex items-center justify-between rounded-t-2xl border-b border-slate-800 bg-slate-900 px-4 py-3">
          <h2 className="font-bold text-white">{popup ? "Edit popup" : "New popup"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-5">
            {/* ── Content ── */}
            <Section title="Content">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Title">
                  <input value={form.title} onChange={(e) => set("title", e.target.value)} className={inp} placeholder="Eid bonus: double points this week!" maxLength={120} />
                </Field>
                <Field label="Type">
                  <select value={kind} onChange={(e) => set("kind", e.target.value)} className={inp}>
                    {POPUP_KINDS.map((k) => <option key={k} value={k}>{POPUP_KIND_LABEL[k]}</option>)}
                  </select>
                </Field>
              </div>

              {(kind === "NOTICE" || kind === "IMAGE" || kind === "AD") && (
                <Field label={kind === "IMAGE" ? "Image" : "Image (optional)"}>
                  <ImageUploadField value={form.imageUrl} onChange={(url) => set("imageUrl", url)} title="Select popup image" />
                </Field>
              )}
              {kind === "VIDEO" && (
                <Field label="Videos">
                  <VideoList value={form.videos} onChange={(v) => set("videos", v)} />
                </Field>
              )}
              {kind === "HTML" && (
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                  <Field label="HTML / ad code" hint="Runs in a sealed frame: scripts work, but the code can't touch the site or the visitor's account.">
                    <textarea
                      value={form.htmlCode}
                      onChange={(e) => set("htmlCode", e.target.value)}
                      className={cn(inp, "min-h-40 font-mono text-xs")}
                      placeholder={'<script src="https://…"></script>\n<div>…</div>'}
                      spellCheck={false}
                    />
                  </Field>
                  <Field label="Height (px)">
                    <input type="number" min={80} max={1200} value={form.htmlHeight} onChange={(e) => set("htmlHeight", Number(e.target.value))} className={inp} />
                  </Field>
                </div>
              )}
              {kind !== "IMAGE" && (
                <Field label={kind === "NOTICE" || kind === "AD" ? "Message" : "Message (optional)"}>
                  <RichTextEditor value={form.body} onChange={(html) => set("body", html)} onPickImage={pick} minHeightClass="min-h-28" placeholder="Write the message…" />
                </Field>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={kind === "IMAGE" ? "Button label (optional)" : "Main button label"}>
                  <input value={form.ctaLabel} onChange={(e) => set("ctaLabel", e.target.value)} className={inp} placeholder="Claim now" maxLength={40} />
                </Field>
                <Field label={kind === "IMAGE" ? "Image / button link" : "Main button link"} hint="A page on the site (/lottery) or a full https:// link.">
                  <input value={form.ctaUrl} onChange={(e) => set("ctaUrl", e.target.value)} className={inp} placeholder="/lottery  or  https://…" />
                </Field>
                {kind !== "IMAGE" && (
                  <>
                    <Field label="Second button label (optional)">
                      <input value={form.cta2Label} onChange={(e) => set("cta2Label", e.target.value)} className={inp} placeholder="Learn more" maxLength={40} />
                    </Field>
                    <Field label="Second button link">
                      <input value={form.cta2Url} onChange={(e) => set("cta2Url", e.target.value)} className={inp} placeholder="/blog/eid-offer" />
                    </Field>
                  </>
                )}
              </div>
              <Field label="Size">
                <div className="flex flex-wrap gap-1.5">
                  {POPUP_SIZES.map((s) => (
                    <Chip key={s} on={form.size === s} onClick={() => set("size", s)}>
                      {POPUP_SIZE_LABEL[s]}
                    </Chip>
                  ))}
                </div>
              </Field>
            </Section>

            {/* ── Where & when ── */}
            <Section title="Where and when">
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
                <Field label="Pages">
                  <PagePicker value={form.paths} onChange={(v) => set("paths", v)} />
                </Field>
              )}
              <Field label="Devices" hint="None selected = every device.">
                <div className="flex flex-wrap gap-1.5">
                  {POPUP_DEVICES.map((d) => (
                    <Chip key={d} on={form.devices.includes(d)} onClick={() => set("devices", toggleIn(form.devices, d))}>
                      {POPUP_DEVICE_LABEL[d]}
                    </Chip>
                  ))}
                </div>
              </Field>
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
            </Section>

            {/* ── Who ── */}
            <Section
              title="Who sees it"
              hint="Leave everything empty for everyone. A person must match every rule you set. Visitors who are not signed in are matched by the country of their connection only."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="KYC status">
                  <select value={form.kycAudience} onChange={(e) => set("kycAudience", e.target.value)} className={inp}>
                    <option value="ANY">Everyone</option>
                    <option value="VERIFIED">Only KYC-verified users</option>
                    <option value="NOT_VERIFIED">Only users who have not done KYC</option>
                  </select>
                </Field>
                <Field label="Plan">
                  <select value={form.planAudience} onChange={(e) => set("planAudience", e.target.value)} className={inp}>
                    {POPUP_PLAN_AUDIENCES.map((k) => <option key={k} value={k}>{POPUP_PLAN_AUDIENCE_LABEL[k]}</option>)}
                  </select>
                </Field>
              </div>
              {packages.length > 0 && (
                <Field label="Only these plans (optional)" hint="None selected = any plan allowed by the rule above.">
                  <div className="flex flex-wrap gap-1.5">
                    {packages.map((pk) => (
                      <Chip key={pk.id} on={form.packageIds.includes(pk.id)} onClick={() => set("packageIds", toggleIn(form.packageIds, pk.id))}>
                        {pk.name}
                      </Chip>
                    ))}
                  </div>
                </Field>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Level">
                  <div className="grid grid-cols-2 gap-2">
                    {numInput("minLevel", "Min")}
                    {numInput("maxLevel", "Max")}
                  </div>
                </Field>
                <Field label="Account age (days)" hint="e.g. max 7 = only people who joined this week.">
                  <div className="grid grid-cols-2 gap-2">
                    {numInput("minAccountDays", "Min")}
                    {numInput("maxAccountDays", "Max")}
                  </div>
                </Field>
              </div>
              <TaskAudienceTargeting value={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />
            </Section>
          </div>

          {/* ── Preview ── */}
          <div className="lg:sticky lg:top-16 lg:self-start">
            <Preview form={form} />
          </div>
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
