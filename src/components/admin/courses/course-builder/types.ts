// Shared types for the CourseBuilder wizard.
// The same shape is used by the admin "new course" page and the tutor "new
// course" page — the only difference is the submit-target endpoint.

export type CourseLessonType =
  | "VIDEO"
  | "ARTICLE"
  | "QUIZ"
  | "ASSIGNMENT"
  | "LIVE"
  | "RESOURCE";

export type CourseSkillLevel =
  | "BEGINNER"
  | "INTERMEDIATE"
  | "ADVANCED"
  | "ALL_LEVELS";

export interface BuilderLesson {
  id?: string; // present when editing an existing lesson
  title: string;
  description: string;
  content: string;
  videoUrl: string;
  subtitlesUrl: string;
  duration: number;
  isPreview: boolean;
  lessonType: CourseLessonType;
  resources: BuilderResource[];
}

export interface BuilderResource {
  label: string;
  url: string;
  mimeType?: string;
}

export interface BuilderModule {
  id?: string;
  title: string;
  description: string;
  lessons: BuilderLesson[];
}

export interface BuilderFaq {
  question: string;
  answer: string;
}

export interface BuilderState {
  // Basics
  title: string;
  slug: string;
  subtitle: string;
  description: string;
  language: string;
  skillLevel: CourseSkillLevel;
  categoryId: string | null;
  subcategoryId: string | null;
  // Media
  thumbnail: string;
  bannerUrl: string;
  promoVideoUrl: string;
  // Pricing
  isFree: boolean;
  price: number;
  originalPrice: number | null;
  discountPrice: number | null;
  discountEndsAt: string; // ISO date string (yyyy-mm-dd) or empty
  commissionRateBps: number | null; // admin-only override
  affiliateCommissionType: "PERCENT" | "FIXED" | null; // tutor-set affiliate reward
  affiliateCommissionValue: number | null;
  // Detail
  learningOutcomes: string[];
  requirements: string[];
  whatsIncluded: string[];
  faqs: BuilderFaq[];
  // SEO
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string[];
  // Visibility
  nsfw: boolean;
  certificateEnabled: boolean;
  // Curriculum
  modules: BuilderModule[];
}

export interface CategoryOption {
  id: string;
  slug: string;
  name: string;
  subcategories?: Array<{ id: string; name: string; slug: string }>;
}

export function makeEmptyLesson(): BuilderLesson {
  return {
    title: "",
    description: "",
    content: "",
    videoUrl: "",
    subtitlesUrl: "",
    duration: 5,
    isPreview: false,
    lessonType: "VIDEO",
    resources: [],
  };
}

export function makeEmptyModule(): BuilderModule {
  return {
    title: "",
    description: "",
    lessons: [makeEmptyLesson()],
  };
}

export function makeEmptyState(): BuilderState {
  return {
    title: "",
    slug: "",
    subtitle: "",
    description: "",
    language: "en",
    skillLevel: "BEGINNER",
    categoryId: null,
    subcategoryId: null,
    thumbnail: "",
    bannerUrl: "",
    promoVideoUrl: "",
    isFree: true,
    price: 0,
    originalPrice: null,
    discountPrice: null,
    discountEndsAt: "",
    commissionRateBps: null,
    affiliateCommissionType: null,
    affiliateCommissionValue: null,
    learningOutcomes: [],
    requirements: [],
    whatsIncluded: [],
    faqs: [],
    seoTitle: "",
    seoDescription: "",
    seoKeywords: [],
    nsfw: false,
    certificateEnabled: true,
    modules: [makeEmptyModule()],
  };
}

/** Total lesson count across all modules. */
export function countLessons(state: BuilderState): number {
  return state.modules.reduce((acc, m) => acc + m.lessons.length, 0);
}

/** Total duration (minutes) across all lessons. */
export function totalDuration(state: BuilderState): number {
  return state.modules.reduce(
    (acc, m) =>
      acc + m.lessons.reduce((a, l) => a + (Number(l.duration) || 0), 0),
    0
  );
}

/** Slugify a title for the URL slug field. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export const STEPS = [
  "Basics",
  "Media",
  "Curriculum",
  "Pricing",
  "Detail",
  "SEO",
  "Review",
] as const;
export type StepName = (typeof STEPS)[number];
