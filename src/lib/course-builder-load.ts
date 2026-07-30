import type {
  BuilderState,
  BuilderModule,
  BuilderLesson,
  BuilderFaq,
  CourseLessonType,
  CourseSkillLevel,
} from "@/components/admin/courses/course-builder/types";

interface LessonRow {
  id: string;
  title: string;
  description: string | null;
  content: string | null;
  videoUrl: string | null;
  subtitlesUrl: string | null;
  duration: number;
  order: number;
  isPreview: boolean;
  lessonType: string;
  resources: unknown;
}

interface ModuleRow {
  id: string;
  title: string;
  description: string | null;
  order: number;
  lessons: LessonRow[];
}

interface CourseRow {
  title: string;
  slug: string | null;
  subtitle: string | null;
  description: string;
  language: string;
  skillLevel: string;
  categoryId: string | null;
  subcategoryId: string | null;
  thumbnail: string | null;
  bannerUrl: string | null;
  promoVideoUrl: string | null;
  isFree: boolean;
  price: number;
  originalPrice: number | null;
  discountPrice: number | null;
  discountEndsAt: Date | null;
  commissionRateBps: number | null;
  affiliateCommissionType: string | null;
  affiliateCommissionValue: number | null;
  learningOutcomes: string[];
  requirements: string[];
  whatsIncluded: string[];
  faqs: unknown;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string[];
  nsfw: boolean;
  certificateEnabled: boolean;
  modules: ModuleRow[];
  lessons: LessonRow[];
}

/** Translate a Course row (with modules + orphan lessons) into the
 *  CourseBuilder's `initial` state. Orphan lessons (no moduleId) get bundled
 *  into a synthetic first module so legacy rows still render in the wizard. */
export function buildBuilderInitialFromCourse(
  course: CourseRow
): Partial<BuilderState> {
  const modules: BuilderModule[] = course.modules.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description ?? "",
    lessons: m.lessons.map(rowToLesson),
  }));

  // Bundle any orphan lessons (legacy data) into a synthetic intro module.
  if (course.lessons.length > 0) {
    modules.unshift({
      title: "Course content",
      description: "",
      lessons: course.lessons.map(rowToLesson),
    });
  }

  return {
    title: course.title,
    slug: course.slug ?? "",
    subtitle: course.subtitle ?? "",
    description: course.description,
    language: course.language,
    skillLevel: course.skillLevel as CourseSkillLevel,
    categoryId: course.categoryId,
    subcategoryId: course.subcategoryId,
    thumbnail: course.thumbnail ?? "",
    bannerUrl: course.bannerUrl ?? "",
    promoVideoUrl: course.promoVideoUrl ?? "",
    isFree: course.isFree,
    price: course.price,
    originalPrice: course.originalPrice,
    discountPrice: course.discountPrice,
    discountEndsAt: course.discountEndsAt
      ? course.discountEndsAt.toISOString().slice(0, 10)
      : "",
    commissionRateBps: course.commissionRateBps,
    affiliateCommissionType:
      course.affiliateCommissionType === "PERCENT" ||
      course.affiliateCommissionType === "FIXED"
        ? course.affiliateCommissionType
        : null,
    affiliateCommissionValue: course.affiliateCommissionValue,
    learningOutcomes: course.learningOutcomes ?? [],
    requirements: course.requirements ?? [],
    whatsIncluded: course.whatsIncluded ?? [],
    faqs: Array.isArray(course.faqs) ? (course.faqs as BuilderFaq[]) : [],
    seoTitle: course.seoTitle ?? "",
    seoDescription: course.seoDescription ?? "",
    seoKeywords: course.seoKeywords ?? [],
    nsfw: course.nsfw,
    certificateEnabled: course.certificateEnabled,
    modules: modules.length > 0 ? modules : [emptyModule()],
  };
}

function rowToLesson(l: LessonRow): BuilderLesson {
  let resources: BuilderLesson["resources"] = [];
  if (Array.isArray(l.resources)) {
    resources = l.resources as BuilderLesson["resources"];
  }
  return {
    id: l.id,
    title: l.title,
    description: l.description ?? "",
    content: l.content ?? "",
    videoUrl: l.videoUrl ?? "",
    subtitlesUrl: l.subtitlesUrl ?? "",
    duration: l.duration,
    isPreview: l.isPreview,
    lessonType: (l.lessonType as CourseLessonType) ?? "VIDEO",
    resources,
  };
}

function emptyModule(): BuilderModule {
  return {
    title: "Course content",
    description: "",
    lessons: [
      {
        title: "",
        description: "",
        content: "",
        videoUrl: "",
        subtitlesUrl: "",
        duration: 5,
        isPreview: false,
        lessonType: "VIDEO",
        resources: [],
      },
    ],
  };
}
