"use client";

import { useState } from "react";
import {
  Loader2,
  Save,
  ExternalLink,
  Eye,
  Menu,
  Star,
  Sparkles,
  ListOrdered,
  Calculator,
  Package,
  MessageSquare,
  Shield,
  HelpCircle,
  Rocket,
  PanelBottom,
  Palette,
  type LucideIcon,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  LANDING_SECTIONS,
  type LandingContent,
  type SectionKey,
} from "@/lib/landing-content";
import { LivePreviewModal } from "./live-preview-modal";
import { NavbarEditor } from "./sections/navbar-editor";
import { HeroEditor } from "./sections/hero-editor";
import { FeaturesEditor } from "./sections/features-editor";
import { HowItWorksEditor } from "./sections/how-it-works-editor";
import { CalculatorEditor } from "./sections/calculator-editor";
import { PackagesEditor } from "./sections/packages-editor";
import { TestimonialsEditor } from "./sections/testimonials-editor";
import { TrustBadgesEditor } from "./sections/trust-badges-editor";
import { FaqEditor } from "./sections/faq-editor";
import { CtaEditor } from "./sections/cta-editor";
import { FooterEditor } from "./sections/footer-editor";
import { AppearanceEditor } from "./sections/appearance-editor";

interface Props {
  initial: LandingContent;
  canEdit: boolean;
}

const ICONS: Record<string, LucideIcon> = {
  Menu,
  Star,
  Sparkles,
  ListOrdered,
  Calculator,
  Package,
  MessageSquare,
  Shield,
  HelpCircle,
  Rocket,
  PanelBottom,
  Palette,
};

export function LandingEditor({ initial, canEdit }: Props) {
  const [content, setContent] = useState<LandingContent>(initial);
  const [active, setActive] = useState<SectionKey>("hero");
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<SectionKey | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const setSection = <K extends SectionKey>(key: K, value: LandingContent[K]) => {
    setContent((prev) => ({ ...prev, [key]: value }));
    setDirty((d) => ({ ...d, [key]: true }));
  };

  const save = async (key: SectionKey) => {
    setBusy(key);
    try {
      const res = await fetch(`/api/admin/landing-page/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(content[key]),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setDirty((d) => ({ ...d, [key]: false }));
      toast.success("Section saved", {
        description: LANDING_SECTIONS.find((s) => s.key === key)?.label,
      });
    } catch (err) {
      toast.error("Failed to save", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(null);
    }
  };

  const activeMeta = LANDING_SECTIONS.find((s) => s.key === active)!;

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      {/* Section rail */}
      <aside className="lg:sticky lg:top-4 self-start rounded-xl border border-slate-800 bg-slate-900 p-2 max-h-[calc(100vh-2rem)] overflow-y-auto">
        <ul className="space-y-0.5">
          {LANDING_SECTIONS.map((s) => {
            const Icon = ICONS[s.icon] ?? Sparkles;
            const isActive = s.key === active;
            const isDirty = !!dirty[s.key];
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => setActive(s.key)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                    isActive
                      ? "bg-blue-500/15 text-white border border-blue-500/40"
                      : "text-slate-400 hover:bg-slate-800 hover:text-white border border-transparent"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 truncate font-medium">{s.label}</span>
                  {isDirty && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-amber-400"
                      title="Unsaved changes"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 pt-3 border-t border-slate-800 space-y-1">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            Show Preview
          </button>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open in new tab
          </a>
        </div>
      </aside>

      {/* Right pane */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-white">{activeMeta.label}</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              {activeMeta.description}
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => save(active)}
              disabled={busy !== null || !dirty[active]}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === active ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save {activeMeta.label}
            </button>
          )}
        </div>

        {!canEdit && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
            You have view-only access. Saves are disabled.
          </div>
        )}

        <div>
          {active === "navbar" && (
            <NavbarEditor
              value={content.navbar}
              onChange={(v) => setSection("navbar", v)}
              disabled={!canEdit}
            />
          )}
          {active === "hero" && (
            <HeroEditor
              value={content.hero}
              onChange={(v) => setSection("hero", v)}
              disabled={!canEdit}
            />
          )}
          {active === "features" && (
            <FeaturesEditor
              value={content.features}
              onChange={(v) => setSection("features", v)}
              disabled={!canEdit}
            />
          )}
          {active === "how_it_works" && (
            <HowItWorksEditor
              value={content.how_it_works}
              onChange={(v) => setSection("how_it_works", v)}
              disabled={!canEdit}
            />
          )}
          {active === "calculator" && (
            <CalculatorEditor
              value={content.calculator}
              onChange={(v) => setSection("calculator", v)}
              disabled={!canEdit}
            />
          )}
          {active === "packages" && (
            <PackagesEditor
              value={content.packages}
              onChange={(v) => setSection("packages", v)}
              disabled={!canEdit}
            />
          )}
          {active === "testimonials" && (
            <TestimonialsEditor
              value={content.testimonials}
              onChange={(v) => setSection("testimonials", v)}
              disabled={!canEdit}
            />
          )}
          {active === "trust_badges" && (
            <TrustBadgesEditor
              value={content.trust_badges}
              onChange={(v) => setSection("trust_badges", v)}
              disabled={!canEdit}
            />
          )}
          {active === "faq" && (
            <FaqEditor
              value={content.faq}
              onChange={(v) => setSection("faq", v)}
              disabled={!canEdit}
            />
          )}
          {active === "cta" && (
            <CtaEditor
              value={content.cta}
              onChange={(v) => setSection("cta", v)}
              disabled={!canEdit}
            />
          )}
          {active === "footer" && (
            <FooterEditor
              value={content.footer}
              onChange={(v) => setSection("footer", v)}
              disabled={!canEdit}
            />
          )}
          {active === "appearance" && (
            <AppearanceEditor
              value={content.appearance}
              onChange={(v) => setSection("appearance", v)}
              disabled={!canEdit}
            />
          )}
        </div>
      </div>

      <LivePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}
