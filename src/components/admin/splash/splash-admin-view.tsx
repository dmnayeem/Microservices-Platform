"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown, Eye } from "lucide-react";
import { toast } from "@/lib/toast";
import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";
import {
  DEFAULT_SPLASH,
  type SplashConfig,
  type SplashSlide,
  type SplashFrequency,
} from "@/lib/splash";

const inputCls =
  "w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500";

export function SplashAdminView() {
  const [cfg, setCfg] = useState<SplashConfig | null>(null);
  const [busy, setBusy] = useState(false);

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

  const setSlide = (i: number, patch: Partial<SplashSlide>) =>
    setCfg({ ...cfg, slides: cfg.slides.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  const addSlide = () => {
    if (cfg.slides.length >= 6) return;
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

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/splash", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      toast.success("Splash screen saved");
    } catch (err) {
      toast.error("Failed", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setBusy(false);
    }
  };

  const preview = () => {
    localStorage.removeItem("splash_seen_v1");
    sessionStorage.removeItem("splash_seen_v1");
    toast.info("Cleared 'seen' flag — open the app (non-admin page) to preview.");
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Splash Screen</h1>
          <p className="text-slate-400 text-sm mt-1">
            Intro slides shown when users open the app.
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

      {/* Settings */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 grid sm:grid-cols-3 gap-4">
        <label className="flex items-center justify-between gap-3 sm:col-span-3">
          <span className="text-sm font-medium text-white">Enabled</span>
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
            className="w-5 h-5 rounded border-slate-700 bg-slate-800 text-blue-500"
          />
        </label>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Duration per slide (seconds)</label>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={cfg.durationMs / 1000}
            onChange={(e) =>
              setCfg({ ...cfg, durationMs: Math.max(500, (Number(e.target.value) || 0) * 1000) })
            }
            className={inputCls}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-slate-400 mb-1">Show frequency</label>
          <select
            value={cfg.frequency}
            onChange={(e) => setCfg({ ...cfg, frequency: e.target.value as SplashFrequency })}
            className={inputCls}
          >
            <option value="once">Once (first visit only)</option>
            <option value="session">Every session</option>
            <option value="always">Every app open</option>
          </select>
        </div>
      </div>

      {/* Slides */}
      <div className="space-y-3">
        {cfg.slides.map((s, i) => (
          <div key={i} className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-white">Slide {i + 1}</p>
              <div className="flex gap-1">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1.5 rounded bg-slate-800 text-slate-300 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                <button onClick={() => move(i, 1)} disabled={i === cfg.slides.length - 1} className="p-1.5 rounded bg-slate-800 text-slate-300 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                <button onClick={() => removeSlide(i)} disabled={cfg.slides.length <= 1} className="p-1.5 rounded bg-slate-800 text-red-400 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
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
          </div>
        ))}
        {cfg.slides.length < 6 && (
          <button
            onClick={addSlide}
            className="w-full inline-flex items-center justify-center gap-1.5 py-3 rounded-xl border border-dashed border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
          >
            <Plus className="w-4 h-4" /> Add slide
          </button>
        )}
      </div>
    </div>
  );
}
