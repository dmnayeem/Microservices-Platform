"use client";

import { confirmDialog } from "@/lib/confirm";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  Trash2,
  Edit,
  Loader2,
  Image as ImageIcon,
  Film,
  Save,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";
import { MediaSelector } from "@/components/media/MediaSelector";
import type { MediaItem } from "@/types/media";
import { DateField } from "@/components/ui/date-field";

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  iconEmoji: string | null;
  bgGradient: string | null;
  linkUrl: string | null;
  location: string;
  order: number;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}

interface Props {
  initial: Banner[];
  canManage: boolean;
}

const GRADIENT_PRESETS = [
  "from-blue-600 to-purple-600",
  "from-pink-500 to-orange-500",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-red-500",
  "from-purple-600 to-pink-600",
  "from-cyan-500 to-blue-500",
  "from-indigo-600 to-fuchsia-600",
  "from-rose-500 to-red-600",
  "from-lime-500 to-emerald-600",
];

export function BannersClient({ initial, canManage }: Props) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Banner | null>(null);
  // Local copy enables optimistic reorder
  const [banners, setBanners] = useState<Banner[]>(
    () => [...initial].sort((a, b) => a.order - b.order)
  );
  const [movingId, setMovingId] = useState<string | null>(null);

  // Re-sync if server data changes (after router.refresh)
  useEffect(() => {
    setBanners([...initial].sort((a, b) => a.order - b.order));
  }, [initial]);

  const move = async (id: string, direction: -1 | 1) => {
    const idx = banners.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= banners.length) return;
    setMovingId(id);

    const a = banners[idx];
    const b = banners[swapIdx];
    // Optimistic local swap (also swap their order numbers so UI sort stays stable)
    const next = [...banners];
    next[idx] = { ...b, order: a.order };
    next[swapIdx] = { ...a, order: b.order };
    next.sort((x, y) => x.order - y.order);
    setBanners(next);

    try {
      // Persist both orders in parallel
      const [r1, r2] = await Promise.all([
        fetch(`/api/admin/banners/${a.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: b.order }),
        }),
        fetch(`/api/admin/banners/${b.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: a.order }),
        }),
      ]);
      if (!r1.ok || !r2.ok) throw new Error("Failed");
      toast.success(direction === -1 ? "Moved up" : "Moved down");
      router.refresh();
    } catch {
      // Revert
      setBanners([...initial].sort((x, y) => x.order - y.order));
      toast.error("Couldn't reorder");
    } finally {
      setMovingId(null);
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/admin/banners/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(isActive ? "Banner activated" : "Banner deactivated");
      router.refresh();
    } catch {
      toast.error("Failed to update banner");
    }
  };

  const remove = async (id: string) => {
    if (!(await confirmDialog({ title: "Delete this banner?", tone: "danger", confirmLabel: "Delete" }))) return;
    try {
      const res = await fetch(`/api/admin/banners/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Banner deleted");
      router.refresh();
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <>
      {canManage && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            New Banner
          </button>
        </div>
      )}

      {banners.length === 0 ? (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-16 text-center">
          <ImageIcon className="w-12 h-12 mx-auto mb-4 text-slate-600" />
          <h3 className="text-lg font-medium text-white mb-1">No banners yet</h3>
          <p className="text-sm text-slate-400">
            Create one to highlight promotions on user pages.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {banners.map((b, idx) => (
            <div
              key={b.id}
              className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden"
            >
              <div
                className={cn(
                  "p-6 bg-linear-to-r",
                  b.bgGradient ?? "from-slate-700 to-slate-800"
                )}
              >
                <div className="flex items-center gap-3">
                  {b.iconEmoji && <span className="text-3xl">{b.iconEmoji}</span>}
                  <div>
                    <p className="text-white font-bold text-lg">{b.title}</p>
                    {b.subtitle && (
                      <p className="text-white/80 text-sm">{b.subtitle}</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        b.isActive
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-slate-700 text-slate-400"
                      }`}
                    >
                      {b.isActive ? "Active" : "Inactive"}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-slate-800 text-slate-300">
                      {b.location}
                    </span>
                    <span className="text-xs text-slate-500">
                      Order: {b.order}
                    </span>
                  </div>
                  {canManage && (
                    <div className="flex gap-1 items-center">
                      <button
                        onClick={() => move(b.id, -1)}
                        disabled={idx === 0 || movingId !== null}
                        className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move up"
                      >
                        {movingId === b.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ChevronUp className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => move(b.id, 1)}
                        disabled={
                          idx === banners.length - 1 || movingId !== null
                        }
                        className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move down"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => toggleActive(b.id, !b.isActive)}
                        className="px-2 py-1 rounded text-xs font-medium hover:bg-slate-700 text-slate-300"
                        title={b.isActive ? "Deactivate" : "Activate"}
                      >
                        {b.isActive ? "Pause" : "Activate"}
                      </button>
                      <button
                        onClick={() => setEditing(b)}
                        className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-blue-400"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => remove(b.id)}
                        className="p-1.5 rounded hover:bg-red-500/10 text-red-400"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
                {b.linkUrl && (
                  <p className="text-xs text-slate-500 truncate">
                    → {b.linkUrl}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateBannerModal
          gradients={GRADIENT_PRESETS}
          onClose={() => setShowCreate(false)}
        />
      )}
      {editing && (
        <EditBannerModal
          banner={editing}
          gradients={GRADIENT_PRESETS}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function EditBannerModal({
  banner,
  gradients,
  onClose,
}: {
  banner: Banner;
  gradients: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const toIsoLocal = (d: Date | null) =>
    d ? new Date(d).toISOString().slice(0, 16) : "";
  const [form, setForm] = useState({
    title: banner.title,
    subtitle: banner.subtitle ?? "",
    iconEmoji: banner.iconEmoji ?? "",
    imageUrl: banner.imageUrl ?? "",
    videoUrl: banner.videoUrl ?? "",
    bgGradient: banner.bgGradient ?? gradients[0],
    linkUrl: banner.linkUrl ?? "",
    location: banner.location,
    order: banner.order,
    isActive: banner.isActive,
    startsAt: toIsoLocal(banner.startsAt),
    endsAt: toIsoLocal(banner.endsAt),
  });

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error("Title required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/banners/${banner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          startsAt: form.startsAt || null,
          endsAt: form.endsAt || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success("Banner updated");
      onClose();
      router.refresh();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Edit Banner</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4">
          <Field label="Title *">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={inp}
            />
          </Field>
          <Field label="Subtitle">
            <input
              value={form.subtitle}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
              className={inp}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Icon Emoji">
              <input
                value={form.iconEmoji}
                onChange={(e) => setForm({ ...form, iconEmoji: e.target.value })}
                className={inp}
              />
            </Field>
            <Field label="Location">
              <select
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className={inp}
              >
                <option value="HOME">Home</option>
                <option value="EARN_HUB">Earn Hub</option>
                <option value="MARKETPLACE">Marketplace</option>
                <option value="DASHBOARD">Dashboard</option>
                <option value="ALL">All</option>
              </select>
            </Field>
          </div>
          <Field label="Banner Image (overrides gradient)">
            <ImageUploadField
              value={form.imageUrl}
              onChange={(url) => setForm({ ...form, imageUrl: url })}
              title="Select Banner Image"
            />
          </Field>
          <Field label="Banner Video (overrides image)">
            <VideoUploadField
              value={form.videoUrl}
              onChange={(url) => setForm({ ...form, videoUrl: url })}
            />
          </Field>
          <Field label="Gradient Background">
            <div className="grid grid-cols-3 gap-2">
              {gradients.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setForm({ ...form, bgGradient: g })}
                  className={cn(
                    "h-10 rounded-lg bg-linear-to-r",
                    g,
                    form.bgGradient === g
                      ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-800"
                      : ""
                  )}
                />
              ))}
            </div>
          </Field>
          <Field label="Link URL (internal path or full URL)">
            <input
              value={form.linkUrl}
              onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
              className={inp}
              placeholder="/lottery  or  https://…"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts At">
              <DateField
                type="datetime-local"
                value={form.startsAt}
                onChange={(v) => setForm({ ...form, startsAt: v })}
                className={inp}
              />
            </Field>
            <Field label="Ends At">
              <DateField
                type="datetime-local"
                value={form.endsAt}
                onChange={(v) => setForm({ ...form, endsAt: v })}
                className={inp}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Order">
              <input
                type="number"
                value={form.order}
                onChange={(e) =>
                  setForm({ ...form, order: parseInt(e.target.value) || 0 })
                }
                className={inp}
              />
            </Field>
            <label className="flex items-center gap-2 px-3 py-2 mt-6">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) =>
                  setForm({ ...form, isActive: e.target.checked })
                }
                className="rounded bg-slate-800 border-slate-600 text-blue-500"
              />
              <span className="text-sm text-slate-300">Active</span>
            </label>
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-700">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateBannerModal({
  gradients,
  onClose,
}: {
  gradients: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "",
    subtitle: "",
    iconEmoji: "🎉",
    imageUrl: "",
    videoUrl: "",
    bgGradient: gradients[0],
    linkUrl: "",
    location: "HOME",
    order: 0,
    isActive: true,
  });

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error("Title required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/banners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success("Banner created");
      onClose();
      router.refresh();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Create Banner</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4">
          <Field label="Title *">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={inp}
            />
          </Field>
          <Field label="Subtitle">
            <input
              value={form.subtitle}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
              className={inp}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Icon Emoji">
              <input
                value={form.iconEmoji}
                onChange={(e) => setForm({ ...form, iconEmoji: e.target.value })}
                className={inp}
                placeholder="🎉"
              />
            </Field>
            <Field label="Location">
              <select
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className={inp}
              >
                <option value="HOME">Home</option>
                <option value="EARN_HUB">Earn Hub</option>
                <option value="MARKETPLACE">Marketplace</option>
                <option value="DASHBOARD">Dashboard</option>
                <option value="ALL">All</option>
              </select>
            </Field>
          </div>
          <Field label="Banner Image (overrides gradient)">
            <ImageUploadField
              value={form.imageUrl}
              onChange={(url) => setForm({ ...form, imageUrl: url })}
              title="Select Banner Image"
            />
          </Field>
          <Field label="Banner Video (overrides image)">
            <VideoUploadField
              value={form.videoUrl}
              onChange={(url) => setForm({ ...form, videoUrl: url })}
            />
          </Field>
          <Field label="Gradient Background">
            <div className="grid grid-cols-3 gap-2">
              {gradients.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setForm({ ...form, bgGradient: g })}
                  className={cn(
                    "h-10 rounded-lg bg-linear-to-r",
                    g,
                    form.bgGradient === g
                      ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-800"
                      : ""
                  )}
                />
              ))}
            </div>
          </Field>
          <Field label="Link URL (internal path or full URL)">
            <input
              value={form.linkUrl}
              onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
              className={inp}
              placeholder="/lottery  or  https://…"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Order">
              <input
                type="number"
                value={form.order}
                onChange={(e) =>
                  setForm({ ...form, order: parseInt(e.target.value) || 0 })
                }
                className={inp}
              />
            </Field>
            <label className="flex items-center gap-2 px-3 py-2 mt-6">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) =>
                  setForm({ ...form, isActive: e.target.checked })
                }
                className="rounded bg-slate-800 border-slate-600 text-blue-500"
              />
              <span className="text-sm text-slate-300">Active</span>
            </label>
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-700">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500";

function VideoUploadField({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const handleSelect = (media: MediaItem | MediaItem[]) => {
    const m = Array.isArray(media) ? media[0] : media;
    if (m) onChange(m.cloudFrontUrl || m.s3Url);
    setOpen(false);
  };
  return (
    <>
      <div className="flex items-start gap-3">
        {value ? (
          <div className="relative shrink-0">
            <video
              src={value}
              muted
              className="w-20 h-14 rounded-lg object-cover bg-slate-950 border border-slate-700"
            />
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute -top-2 -right-2 p-1 bg-red-500 rounded-full text-white hover:bg-red-600"
              title="Remove video"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="w-20 h-14 bg-slate-950 border border-slate-700 border-dashed rounded-lg flex items-center justify-center shrink-0">
            <Film className="w-7 h-7 text-slate-600" />
          </div>
        )}
        <div className="flex-1 space-y-2 min-w-0">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700 border border-slate-700"
          >
            <Film className="w-4 h-4" />
            {value ? "Change Video" : "Upload / Pick Video"}
          </button>
          <input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="…or paste a video URL"
            className={inp}
          />
        </div>
      </div>
      <MediaSelector
        isOpen={open}
        onClose={() => setOpen(false)}
        onSelect={handleSelect}
        fileType="VIDEO"
        title="Select Banner Video"
      />
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
