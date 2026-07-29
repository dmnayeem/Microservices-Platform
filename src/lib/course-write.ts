import { prisma } from "@/lib/prisma";
import { z } from "zod";
import {
  CourseStatus,
  CourseSkillLevel,
  CourseLessonType,
  NotificationType,
} from "@/generated/prisma";

// ── Zod input schemas ──────────────────────────────────────────────────────

const resourceSchema = z.object({
  label: z.string().max(120),
  url: z.string().url().max(2000),
  mimeType: z.string().max(120).optional(),
});

const lessonSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional().nullable(),
  content: z.string().max(50000).optional().nullable(),
  videoUrl: z.string().url().max(2000).optional().nullable().or(z.literal("")),
  subtitlesUrl: z.string().url().max(2000).optional().nullable().or(z.literal("")),
  duration: z.number().int().min(0).default(0),
  order: z.number().int().min(0).default(0),
  isPreview: z.boolean().default(false),
  lessonType: z
    .enum(["VIDEO", "ARTICLE", "QUIZ", "ASSIGNMENT", "LIVE", "RESOURCE"])
    .default("VIDEO"),
  resources: z.array(resourceSchema).max(20).default([]),
});

const moduleSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional().nullable(),
  order: z.number().int().min(0).default(0),
  lessons: z.array(lessonSchema).max(100),
});

const faqSchema = z.object({
  question: z.string().max(300),
  answer: z.string().max(2000),
});

export const courseWriteSchema = z.object({
  title: z.string().min(3).max(140),
  slug: z
    .string()
    .max(80)
    .regex(/^[a-z0-9-]+$/)
    .optional()
    .nullable(),
  subtitle: z.string().max(200).optional().nullable(),
  description: z.string().min(30).max(5000),
  language: z.string().max(10).default("en"),
  skillLevel: z
    .enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "ALL_LEVELS"])
    .default("BEGINNER"),
  categoryId: z.string().optional().nullable(),
  subcategoryId: z.string().optional().nullable(),
  thumbnail: z.string().url().optional().nullable(),
  bannerUrl: z.string().url().optional().nullable(),
  promoVideoUrl: z.string().url().optional().nullable(),
  isFree: z.boolean().default(true),
  price: z.number().min(0).default(0),
  originalPrice: z.number().min(0).optional().nullable(),
  discountPrice: z.number().min(0).optional().nullable(),
  discountEndsAt: z.string().optional().nullable(),
  commissionRateBps: z.number().int().min(0).max(10000).optional().nullable(),
  // Tutor-set affiliate reward (from the tutor's cut). See src/lib/affiliate.ts.
  affiliateCommissionType: z.enum(["PERCENT", "FIXED"]).optional().nullable(),
  affiliateCommissionValue: z.number().min(0).optional().nullable(),
  learningOutcomes: z.array(z.string().max(200)).max(30).default([]),
  requirements: z.array(z.string().max(200)).max(30).default([]),
  whatsIncluded: z.array(z.string().max(200)).max(30).default([]),
  faqs: z.array(faqSchema).max(30).default([]),
  seoTitle: z.string().max(140).optional().nullable(),
  seoDescription: z.string().max(320).optional().nullable(),
  seoKeywords: z.array(z.string().max(60)).max(30).default([]),
  nsfw: z.boolean().default(false),
  certificateEnabled: z.boolean().default(true),
  modules: z.array(moduleSchema).max(50),
  statusAction: z.enum(["draft", "submit"]).default("draft"),
});

export type CourseWriteInput = z.infer<typeof courseWriteSchema>;

// ── Persist ─────────────────────────────────────────────────────────────────

export interface SaveOpts {
  /** Who is writing — drives status resolution + ownership rules. */
  actor: "admin" | "tutor";
  /** Authenticated user id. */
  userId: string;
  /** Existing course id when editing; undefined → create. */
  courseId?: string;
}

/** Resolve the next status based on actor + action + current status.
 *  Rules:
 *   - actor=admin, action=submit → PUBLISHED
 *   - actor=tutor, action=submit → PENDING_REVIEW
 *   - action=draft               → keep current if PUBLISHED/PENDING_REVIEW, else DRAFT
 */
function resolveStatus(
  current: CourseStatus | null,
  actor: "admin" | "tutor",
  action: "draft" | "submit"
): CourseStatus {
  if (action === "submit") {
    return actor === "admin" ? CourseStatus.PUBLISHED : CourseStatus.PENDING_REVIEW;
  }
  // draft
  if (
    current === CourseStatus.PUBLISHED ||
    current === CourseStatus.PENDING_REVIEW
  ) {
    return current;
  }
  return CourseStatus.DRAFT;
}

/** Look up the slug of the category referenced by `categoryId`. Used to keep
 *  the legacy free-form `category` column in sync (back-compat for the existing
 *  /admin/courses list + filter UI which still reads from it). */
async function lookupCategorySlug(categoryId: string | null | undefined) {
  if (!categoryId) return null;
  const row = await prisma.courseCategory.findUnique({
    where: { id: categoryId },
    select: { slug: true, name: true },
  });
  return row;
}

export async function saveCourse(input: CourseWriteInput, opts: SaveOpts) {
  // Compute totals before persisting
  const totalLessons = input.modules.reduce(
    (acc, m) => acc + m.lessons.length,
    0
  );
  const totalDuration = input.modules.reduce(
    (acc, m) =>
      acc + m.lessons.reduce((a, l) => a + (l.duration ?? 0), 0),
    0
  );

  const cat = await lookupCategorySlug(input.categoryId ?? null);

  // Difficulty mirror for the legacy column — keeps existing browse page happy.
  const difficulty =
    input.skillLevel === "ALL_LEVELS" ? "BEGINNER" : input.skillLevel;

  // Resolve status against the existing course (if editing)
  let currentStatus: CourseStatus | null = null;
  if (opts.courseId) {
    const existing = await prisma.course.findUnique({
      where: { id: opts.courseId },
      select: { status: true, tutorId: true, createdById: true },
    });
    if (!existing) throw new Error("Course not found");
    if (opts.actor === "tutor" && existing.tutorId !== opts.userId) {
      throw new Error("You can only edit courses you own");
    }
    currentStatus = existing.status;
  }
  const nextStatus = resolveStatus(
    currentStatus,
    opts.actor,
    input.statusAction
  );

  // Slug — if not provided, generate from title (admin or tutor)
  let slug = input.slug ?? null;
  if (!slug) {
    slug = slugifyTitle(input.title);
    // De-dup against existing rows
    slug = await ensureUniqueSlug(slug, opts.courseId);
  } else if (slug) {
    slug = await ensureUniqueSlug(slug, opts.courseId);
  }

  const baseData = {
    title: input.title,
    slug,
    subtitle: input.subtitle || null,
    description: input.description,
    language: input.language,
    skillLevel: input.skillLevel as CourseSkillLevel,
    difficulty,
    category: cat?.name ?? "General",
    categoryId: input.categoryId ?? null,
    subcategoryId: input.subcategoryId ?? null,
    thumbnail: input.thumbnail || null,
    bannerUrl: input.bannerUrl || null,
    promoVideoUrl: input.promoVideoUrl || null,
    isFree: input.isFree,
    price: input.isFree ? 0 : input.price,
    originalPrice: input.originalPrice ?? null,
    discountPrice: input.discountPrice ?? null,
    discountEndsAt: input.discountEndsAt ? new Date(input.discountEndsAt) : null,
    commissionRateBps:
      opts.actor === "admin" ? input.commissionRateBps ?? null : undefined,
    affiliateCommissionType:
      input.affiliateCommissionValue && input.affiliateCommissionValue > 0
        ? (input.affiliateCommissionType ?? "PERCENT")
        : null,
    affiliateCommissionValue:
      input.affiliateCommissionValue && input.affiliateCommissionValue > 0
        ? input.affiliateCommissionValue
        : null,
    learningOutcomes: input.learningOutcomes,
    requirements: input.requirements,
    whatsIncluded: input.whatsIncluded,
    faqs: input.faqs as unknown as object,
    seoTitle: input.seoTitle || null,
    seoDescription: input.seoDescription || null,
    seoKeywords: input.seoKeywords,
    nsfw: input.nsfw,
    certificateEnabled: input.certificateEnabled,
    status: nextStatus,
    totalLessons,
    totalDuration,
    publishedAt:
      nextStatus === CourseStatus.PUBLISHED ? new Date() : currentStatus === CourseStatus.PUBLISHED ? undefined : null,
    lastContentUpdate: new Date(),
  };

  // Strip `undefined` so Prisma doesn't write them
  const data: Record<string, unknown> = Object.fromEntries(
    Object.entries(baseData).filter(([, v]) => v !== undefined)
  );

  let course;
  if (opts.courseId) {
    course = await prisma.course.update({
      where: { id: opts.courseId },
      data: data as never,
    });

    // Replace curriculum: nuke + re-create modules/lessons. Simpler than
    // computing diffs and correct for v1 (no enrolled-student progress
    // depends on lesson ids yet — Phase 3 wires that, and by then we'll
    // do shallow merges by id).
    await prisma.courseLesson.deleteMany({
      where: { courseId: opts.courseId },
    });
    await prisma.courseModule.deleteMany({
      where: { courseId: opts.courseId },
    });
  } else {
    const createData: Record<string, unknown> = {
      ...data,
      createdById: opts.userId,
      tutorId: opts.actor === "tutor" ? opts.userId : null,
    };
    course = await prisma.course.create({
      data: createData as never,
    });
  }

  // Persist modules + lessons sequentially so we can use generated module ids.
  for (const [mi, m] of input.modules.entries()) {
    const mod = await prisma.courseModule.create({
      data: {
        courseId: course.id,
        title: m.title,
        description: m.description ?? null,
        order: mi,
      },
    });
    for (const [li, l] of m.lessons.entries()) {
      await prisma.courseLesson.create({
        data: {
          courseId: course.id,
          moduleId: mod.id,
          title: l.title,
          description: l.description ?? null,
          content: l.content ?? null,
          videoUrl: l.videoUrl || null,
          subtitlesUrl: l.subtitlesUrl || null,
          duration: l.duration ?? 0,
          order: li,
          isPreview: l.isPreview,
          isFree: l.isPreview, // mirror for back-compat
          lessonType: l.lessonType as CourseLessonType,
          resources:
            l.resources && l.resources.length > 0
              ? (l.resources as unknown as object)
              : undefined,
        },
      });
    }
  }

  // Status-change notifications + tutor counter updates
  if (
    nextStatus === CourseStatus.PENDING_REVIEW &&
    currentStatus !== CourseStatus.PENDING_REVIEW
  ) {
    // Notify admins with courses.approve permission — we just create a
    // SYSTEM notification for the tutor confirming submission; the admin
    // queue lives at /admin/courses?status=PENDING_REVIEW.
    if (course.tutorId) {
      await prisma.notification.create({
        data: {
          userId: course.tutorId,
          type: NotificationType.COURSE,
          title: "Course submitted for review",
          message: `"${course.title}" is now in the admin review queue. You'll be notified once it's approved.`,
          data: { courseId: course.id },
        },
      });
    }
  }

  return course;
}

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "course";
}

async function ensureUniqueSlug(
  base: string,
  excludeCourseId?: string
): Promise<string> {
  let candidate = base;
  let n = 1;
  // Worst case: a few extra DB hits — acceptable for course creation.
  while (
    await prisma.course.findFirst({
      where: {
        slug: candidate,
        ...(excludeCourseId ? { id: { not: excludeCourseId } } : {}),
      },
      select: { id: true },
    })
  ) {
    n += 1;
    candidate = `${base}-${n}`.slice(0, 80);
    if (n > 50) break;
  }
  return candidate;
}
