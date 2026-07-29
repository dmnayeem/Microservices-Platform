"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Save,
  Send,
  CheckCircle2,
  CircleDashed,
  FileText,
  Image as ImageIcon,
  ListChecks,
  DollarSign,
  Sparkles,
  Search,
  ClipboardCheck,
} from "lucide-react";
import {
  STEPS,
  type BuilderState,
  type CategoryOption,
  type StepName,
  countLessons,
  totalDuration,
  makeEmptyState,
  slugify,
} from "./types";
import { BasicsStep } from "./steps/BasicsStep";
import { MediaStep } from "./steps/MediaStep";
import { CurriculumStep } from "./steps/CurriculumStep";
import { PricingStep } from "./steps/PricingStep";
import { DetailStep } from "./steps/DetailStep";
import { SeoStep } from "./steps/SeoStep";
import { ReviewStep } from "./steps/ReviewStep";

interface Props {
  /** Who is using the builder. Drives submit endpoint + admin-only fields. */
  role: "admin" | "tutor";
  /** Initial state for editing; omit for create. */
  initial?: Partial<BuilderState>;
  /** Existing course id when editing; omit for create. */
  courseId?: string;
  /** Categories loaded server-side. */
  categories: CategoryOption[];
}

const stepIcons: Record<StepName, React.ComponentType<{ className?: string }>> = {
  Basics: FileText,
  Media: ImageIcon,
  Curriculum: ListChecks,
  Pricing: DollarSign,
  Detail: Sparkles,
  SEO: Search,
  Review: ClipboardCheck,
};

export function CourseBuilder({ role, initial, courseId, categories }: Props) {
  const router = useRouter();
  const [state, setState] = useState<BuilderState>(() => ({
    ...makeEmptyState(),
    ...(initial ?? {}),
  }));
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);

  const update = <K extends keyof BuilderState>(key: K, value: BuilderState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  // Auto-fill slug when title changes, only if user hasn't manually edited the
  // slug yet (we treat "empty slug" or "slug matches a slugified earlier title"
  // as "auto-managed").
  useEffect(() => {
    if (!state.slug && state.title) {
      setState((prev) => ({ ...prev, slug: slugify(prev.title) }));
    }
  }, [state.slug, state.title]);

  const validations = useMemo(() => validate(state), [state]);
  const stepBlockers: Record<StepName, string[]> = useMemo(
    () => ({
      Basics: validations.basics,
      Media: validations.media,
      Curriculum: validations.curriculum,
      Pricing: validations.pricing,
      Detail: validations.detail,
      SEO: validations.seo,
      Review: validations.review,
    }),
    [validations]
  );

  const goto = (n: number) => setStep(Math.max(0, Math.min(STEPS.length - 1, n)));

  const submit = async (action: "draft" | "submit") => {
    // For submit, every section's blockers must be empty
    if (action === "submit") {
      const allBlockers = Object.entries(stepBlockers).flatMap(([k, v]) =>
        v.map((m) => `${k}: ${m}`)
      );
      if (allBlockers.length > 0) {
        toast.error("Fix these before submitting", {
          description: allBlockers.slice(0, 4).join(" • "),
        });
        return;
      }
    } else {
      // Draft just requires a title
      if (!state.title.trim()) {
        toast.error("Title is required, even for a draft");
        return;
      }
    }

    setBusy(action);
    try {
      const endpoint =
        role === "admin"
          ? courseId
            ? `/api/admin/courses/${courseId}`
            : "/api/admin/courses"
          : courseId
          ? `/api/tutor/courses/${courseId}`
          : "/api/tutor/courses";

      const method = courseId ? "PATCH" : "POST";
      const body = serializeForApi(state, role, action);

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);

      toast.success(
        action === "draft"
          ? "Draft saved"
          : role === "admin"
          ? "Course published"
          : "Submitted for admin review"
      );
      const created = d.course;
      const nextHref =
        role === "admin"
          ? "/admin/courses"
          : `/tutor/courses${created?.id ? `/${created.id}` : ""}`;
      router.push(nextHref);
      router.refresh();
    } catch (err) {
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(null);
    }
  };

  const stepName = STEPS[step];
  const stepBlocker = stepBlockers[stepName];

  return (
    <div className="space-y-4">
      <Stepper
        current={step}
        onSelect={goto}
        blockers={stepBlockers}
        state={state}
      />

      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 md:p-6 min-h-[420px]">
        {stepName === "Basics" && (
          <BasicsStep state={state} update={update} categories={categories} />
        )}
        {stepName === "Media" && <MediaStep state={state} update={update} />}
        {stepName === "Curriculum" && (
          <CurriculumStep state={state} update={update} />
        )}
        {stepName === "Pricing" && (
          <PricingStep state={state} update={update} canSetCommission={role === "admin"} />
        )}
        {stepName === "Detail" && <DetailStep state={state} update={update} />}
        {stepName === "SEO" && <SeoStep state={state} update={update} />}
        {stepName === "Review" && (
          <ReviewStep state={state} blockers={stepBlockers} role={role} />
        )}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => goto(step - 1)}
          disabled={step === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-sm"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          Step {step + 1} of {STEPS.length}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => submit("draft")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold disabled:opacity-50"
          >
            {busy === "draft" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save draft
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => goto(step + 1)}
              disabled={stepBlocker.length > 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold disabled:opacity-50"
              title={stepBlocker.join("\n")}
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => submit("submit")}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-50"
            >
              {busy === "submit" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {role === "admin" ? "Publish course" : "Submit for review"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stepper({
  current,
  onSelect,
  blockers,
  state,
}: {
  current: number;
  onSelect: (n: number) => void;
  blockers: Record<StepName, string[]>;
  state: BuilderState;
}) {
  return (
    <div className="bg-slate-950 rounded-xl border border-slate-800 p-2">
      <div className="flex items-center gap-1 overflow-x-auto">
        {STEPS.map((name, i) => {
          const Icon = stepIcons[name];
          const ok = blockers[name].length === 0;
          const active = current === i;
          return (
            <button
              key={name}
              type="button"
              onClick={() => onSelect(i)}
              className={
                "flex-1 min-w-[110px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors " +
                (active
                  ? "bg-indigo-600 text-white"
                  : ok
                  ? "text-emerald-300 hover:bg-slate-800"
                  : "text-slate-400 hover:bg-slate-800")
              }
            >
              {ok && !active ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <Icon className="w-3.5 h-3.5" />
              )}
              {name}
              {name === "Curriculum" && (
                <span className="ml-1 text-[10px] opacity-70">
                  {countLessons(state)}
                </span>
              )}
              {!ok && !active && (
                <CircleDashed className="w-3 h-3 text-rose-400 ml-1" />
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-2 px-2 text-[11px] text-slate-500 flex items-center gap-3">
        <span>Lessons: {countLessons(state)}</span>
        <span>·</span>
        <span>Total duration: {totalDuration(state)} min</span>
      </div>
    </div>
  );
}

interface ValidationGroups {
  basics: string[];
  media: string[];
  curriculum: string[];
  pricing: string[];
  detail: string[];
  seo: string[];
  review: string[];
}

function validate(s: BuilderState): ValidationGroups {
  const basics: string[] = [];
  if (!s.title.trim()) basics.push("Title is required");
  if (s.title.trim().length > 0 && s.title.trim().length < 3)
    basics.push("Title must be at least 3 characters");
  if (s.description.trim().length < 30)
    basics.push("Description must be at least 30 characters");
  if (!s.slug.trim()) basics.push("Slug is required");
  else if (!/^[a-z0-9-]+$/.test(s.slug))
    basics.push("Slug: lowercase letters / numbers / dashes only");
  if (!s.categoryId) basics.push("Pick a category");

  const media: string[] = [];
  if (!s.thumbnail) media.push("Thumbnail is required");

  const curriculum: string[] = [];
  const lessons = countLessons(s);
  if (s.modules.length === 0) curriculum.push("Add at least one module");
  if (lessons === 0) curriculum.push("Add at least one lesson");
  if (s.modules.some((m) => !m.title.trim()))
    curriculum.push("Every module needs a title");
  if (s.modules.some((m) => m.lessons.some((l) => !l.title.trim())))
    curriculum.push("Every lesson needs a title");

  const pricing: string[] = [];
  if (!s.isFree && (!Number.isFinite(s.price) || s.price <= 0))
    pricing.push("Paid courses need a price greater than 0");

  const detail: string[] = [];
  if (s.learningOutcomes.length < 2)
    detail.push("Add at least 2 learning outcomes");

  const seo: string[] = []; // SEO is optional
  const review: string[] = []; // Review step has no inputs
  return { basics, media, curriculum, pricing, detail, seo, review };
}

function serializeForApi(
  s: BuilderState,
  role: "admin" | "tutor",
  action: "draft" | "submit"
) {
  return {
    title: s.title.trim(),
    slug: s.slug.trim() || null,
    subtitle: s.subtitle.trim() || null,
    description: s.description.trim(),
    language: s.language || "en",
    skillLevel: s.skillLevel,
    categoryId: s.categoryId,
    subcategoryId: s.subcategoryId,
    thumbnail: s.thumbnail || null,
    bannerUrl: s.bannerUrl || null,
    promoVideoUrl: s.promoVideoUrl || null,
    isFree: s.isFree,
    price: s.isFree ? 0 : s.price,
    originalPrice: s.originalPrice ?? null,
    discountPrice: s.discountPrice ?? null,
    discountEndsAt: s.discountEndsAt || null,
    // commissionRateBps is admin-only; tutors can't set it
    commissionRateBps:
      role === "admin" && s.commissionRateBps !== null
        ? s.commissionRateBps
        : null,
    affiliateCommissionType:
      s.affiliateCommissionValue && s.affiliateCommissionValue > 0
        ? (s.affiliateCommissionType ?? "PERCENT")
        : null,
    affiliateCommissionValue:
      s.affiliateCommissionValue && s.affiliateCommissionValue > 0
        ? s.affiliateCommissionValue
        : null,
    learningOutcomes: s.learningOutcomes,
    requirements: s.requirements,
    whatsIncluded: s.whatsIncluded,
    faqs: s.faqs,
    seoTitle: s.seoTitle || null,
    seoDescription: s.seoDescription || null,
    seoKeywords: s.seoKeywords,
    nsfw: s.nsfw,
    certificateEnabled: s.certificateEnabled,
    modules: s.modules.map((m, mi) => ({
      id: m.id,
      title: m.title.trim(),
      description: m.description.trim() || null,
      order: mi,
      lessons: m.lessons.map((l, li) => ({
        id: l.id,
        title: l.title.trim(),
        description: l.description.trim() || null,
        content: l.content || null,
        videoUrl: l.videoUrl || null,
        subtitlesUrl: l.subtitlesUrl || null,
        duration: Number(l.duration) || 0,
        order: li,
        isPreview: l.isPreview,
        lessonType: l.lessonType,
        resources: l.resources,
      })),
    })),
    // Status hint for the API to interpret
    statusAction: action, // "draft" → DRAFT, "submit" → admin: PUBLISHED, tutor: PENDING_REVIEW
  };
}
