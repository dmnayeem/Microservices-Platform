"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown, Eye, Image as ImageIcon, LayoutTemplate } from "lucide-react";
import { DeviceTargetPicker } from "@/components/shared/device-target-picker";
import { toast } from "@/lib/toast";
import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { SplashView } from "@/components/pwa/splash-screen";
import {
  DEFAULT_SPLASH,
  SPLASH_MAX_SLIDES,
  type SplashAudience,
  type SplashConfig,
  type SplashMode,
  type SplashSlide,
} from "@/lib/splash";

/** ISO → the value a datetime-local input wants (local time). */
function toLocal(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

const inputCls =
  "w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500";

const MODES: { id: SplashMode; title: string; desc: string; icon: React.ReactNode }[] = [
  {
    id: "slides",
    title: "Image + title + text",
    desc: "A picture with a title and a short text, Next / Get started buttons. Moves on by itself.",
    icon: <LayoutTemplate className="w-5 h-5" />,
  },
  {
    id: "images",
    title: "Image only (9:16, full screen)",
    desc: "Just your pictures, full screen — no buttons, no text. Tap for the next one; the last tap closes it.",
    icon: <ImageIcon className="w-5 h-5" />,
  },
];

export function SplashAdminView() {
  const [cfg, setCfg] = useState<SplashConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/splash")
      .then((r) => r.json())
      .then((d) => {
        if (active) setCfg(d.config ?? { ...DEFAULT_SPLASH });
      })
      .catch(() => active && setCfg({ ...DEFAULT_SPLASH }));
    return () => {
      active = false;
    };
  }, []);

  if (!cfg) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
      </div>
    );
  }

  const imagesOnly = cfg.mode === "images";
  const setSlide = (i: number, patch: Partial<SplashSlide>) =>
    setCfg({ ...cfg, slides: cfg.slides.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  const addSlide = () => {
    if (cfg.slides.length >= SPLASH_MAX_SLIDES) return;
    setCfg({ ...cfg, slides: [...cfg.slides, { title: "", content: "", imageUrl: "" }] });
  };
  const removeSlide = (i: number) => {
    if (cfg.slides.length <= 1) return;
    setCfg({ ...cfg, slides: cfg.slides.filter((_, idx) => idx !== i) });
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= cfg.slides.length) return;
    const next = [...cfg.slides];
    [next[i], next[j]] = [next[j], next[i]];
    setCfg({ ...cfg, slides: next });
  };

  // What members would actually get (same filter as /api/splash).
  const usable = imagesOnly
    ? cfg.slides.filter((s) => s.imageUrl)
    : cfg.slides.filter((s) => s.title || s.content || s.imageUrl);

  const save = async () => {
    if (cfg.enabled && usable.length === 0) {
      toast.error(imagesOnly ? "Add at least one image" : "Add at least one slide", {
        description: "With nothing to show, the splash stays off.",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/splash", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      toast.success("Splash screen saved", {
        description: "Members see it once, the next time they sign in or register.",
      });
    } catch (err) {
      toast.error("Failed", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setBusy(false);
    }
  };

  const preview = () => {
    if (usable.length === 0) {
      toast.error(imagesOnly ? "Add an image first" : "Add a slide first");
      return;
    }
    setPreviewing(true);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {previewing && (
        <SplashView
          cfg={{ mode: cfg.mode, durationMs: cfg.durationMs, slides: usable }}
          onClose={() => setPreviewing(false)}
        />
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Splash Screen</h1>
          <p className="text-slate-400 text-sm mt-1">
            Shown once, right after a member signs in or registers. Visitors and members who are
            already signed in never see it again until their next sign-in.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={preview}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 text-slate-200 text-sm font-semibold hover:bg-slate-700"
          >
            <Eye className="w-4 h-4" /> Preview
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>

      {/* Style */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <p className="text-sm font-semibold text-white">Style</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {MODES.map((m) => {
            const on = cfg.mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setCfg({ ...cfg, mode: m.id })}
                className={`text-left rounded-xl border p-3 transition ${
                  on ? "border-blue-500 bg-blue-500/10" : "border-slate-700 hover:border-slate-600"
                }`}
              >
                <span className={`inline-flex items-center gap-2 text-sm font-semibold ${on ? "text-white" : "text-slate-200"}`}>
                  {m.icon} {m.title}
                </span>
                <span className="mt-1 block text-xs text-slate-400">{m.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Settings */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 grid sm:grid-cols-2 gap-4">
        <label className="flex items-center justify-between gap-3 sm:col-span-2">
          <span className="text-sm font-medium text-white">Enabled</span>
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
            className="w-5 h-5 rounded border-slate-700 bg-slate-800 text-blue-500"
          />
        </label>
        <div className={imagesOnly ? "sm:col-span-2" : ""}>
          <label className="block text-xs text-slate-400 mb-1">Who sees it</label>
          <select
            value={cfg.audience}
            onChange={(e) => setCfg({ ...cfg, audience: e.target.value as SplashAudience })}
            className={inputCls}
          >
            <option value="login">Everyone — once, right after each sign-in or registration</option>
            <option value="new">New members only — right after registering (first day)</option>
          </select>
        </div>
        {!imagesOnly && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">Seconds per slide</label>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={cfg.durationMs / 1000}
              onChange={(e) => setCfg({ ...cfg, durationMs: Math.max(500, (Number(e.target.value) || 0) * 1000) })}
              className={inputCls}
            />
          </div>
        )}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Show from (optional)</label>
          <input
            type="datetime-local"
            value={toLocal(cfg.startsAt)}
            onChange={(e) => setCfg({ ...cfg, startsAt: e.target.value ? new Date(e.target.value).toISOString() : "" })}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Show until (optional)</label>
          <input
            type="datetime-local"
            value={toLocal(cfg.endsAt)}
            onChange={(e) => setCfg({ ...cfg, endsAt: e.target.value ? new Date(e.target.value).toISOString() : "" })}
            className={inputCls}
          />
        </div>
        <div className="sm:col-span-2">
          <DeviceTargetPicker
            value={{
              deviceTypes: cfg.deviceTypes ?? [],
              deviceOses: cfg.deviceOses ?? [],
              deviceBrands: cfg.deviceBrands ?? [],
            }}
            onChange={(d) => setCfg({ ...cfg, ...d })}
            note="The splash shows only on these devices."
          />
        </div>
      </div>

      {imagesOnly && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-slate-300 space-y-1">
          <p className="font-semibold text-white">Image size</p>
          <p>
            Upload tall pictures in <strong>9:16</strong> — for example <strong>1080 × 1920 px</strong>. The whole
            picture is always shown, never cut: on taller phones a soft blurred copy fills the edges, and on a
            computer it stands in the middle. Keep important text away from the very top and bottom.
          </p>
        </div>
      )}

      {/* Slides / images */}
      <div className="space-y-3">
        {cfg.slides.map((s, i) => (
          <div key={i} className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-white">{imagesOnly ? `Image ${i + 1}` : `Slide ${i + 1}`}</p>
              <div className="flex gap-1">
                <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="p-1.5 rounded bg-slate-800 text-slate-300 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                <button onClick={() => move(i, 1)} disabled={i === cfg.slides.length - 1} aria-label="Move down" className="p-1.5 rounded bg-slate-800 text-slate-300 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                <button onClick={() => removeSlide(i)} disabled={cfg.slides.length <= 1} aria-label="Remove" className="p-1.5 rounded bg-slate-800 text-red-400 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            {imagesOnly ? (
              <div className="flex flex-wrap items-start gap-4">
                <div className="relative aspect-9/16 w-24 shrink-0 overflow-hidden rounded-lg border border-slate-700 bg-black">
                  {s.imageUrl ? (
                    <SmartImage src={s.imageUrl} alt={`Image ${i + 1}`} fill sizes="96px" className="object-contain" />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center text-[10px] text-slate-500">9:16</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <label className="block text-xs text-slate-400 mb-1">Image (9:16, e.g. 1080 × 1920)</label>
                  <ImageUploadField value={s.imageUrl} onChange={(url) => setSlide(i, { imageUrl: url })} title="Select Splash Image" previewSize="lg" />
                </div>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Title</label>
                  <input value={s.title} onChange={(e) => setSlide(i, { title: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Content</label>
                  <textarea value={s.content} onChange={(e) => setSlide(i, { content: e.target.value })} rows={2} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Image</label>
                  <ImageUploadField value={s.imageUrl} onChange={(url) => setSlide(i, { imageUrl: url })} title="Select Splash Image" previewSize="lg" />
                </div>
              </>
            )}
          </div>
        ))}
        {cfg.slides.length < SPLASH_MAX_SLIDES && (
          <button
            onClick={addSlide}
            className="w-full inline-flex items-center justify-center gap-1.5 py-3 rounded-xl border border-dashed border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
          >
            <Plus className="w-4 h-4" /> {imagesOnly ? "Add image" : "Add slide"}
          </button>
        )}
      </div>
    </div>
  );
}
