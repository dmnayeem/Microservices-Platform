import { prisma } from "@/lib/prisma";
import { TutorApplicationStatus, NotificationType, UserRole } from "@/generated/prisma";

export interface TutorApplicationInput {
  bio: string;
  expertise: string[];
  sampleOutline?: string | null;
  portfolioUrl?: string | null;
  idDocumentUrl?: string | null;
}

export async function createTutorApplication(
  userId: string,
  input: TutorApplicationInput
) {
  const existing = await prisma.tutorApplication.findFirst({
    where: { userId, status: TutorApplicationStatus.PENDING },
  });
  if (existing) {
    throw new Error("You already have a pending application.");
  }
  return prisma.tutorApplication
    .create({
      data: {
        userId,
        bio: input.bio,
        expertise: input.expertise ?? [],
        sampleOutline: input.sampleOutline ?? null,
        portfolioUrl: input.portfolioUrl ?? null,
        idDocumentUrl: input.idDocumentUrl ?? null,
      },
    })
    .catch((err: unknown) => {
      // Partial unique "one PENDING per user" — a double submit raced the check above.
      if ((err as { code?: string })?.code === "P2002") {
        throw new Error("You already have a pending application.");
      }
      throw err;
    });
}

/** Approve a pending application:
 *  - flips application.status → APPROVED
 *  - upgrades user.role → TUTOR (only if currently USER — never demote an admin)
 *  - creates / upserts the TutorProfile row so the dashboard can render
 *  - notifies the user
 */
export async function approveTutorApplication(opts: {
  applicationId: string;
  reviewerId: string;
  adminNote?: string | null;
}) {
  const app = await prisma.tutorApplication.findUnique({
    where: { id: opts.applicationId },
    include: { user: { select: { id: true, role: true, name: true } } },
  });
  if (!app) throw new Error("Application not found");
  if (app.status !== TutorApplicationStatus.PENDING) {
    throw new Error(`Application is already ${app.status.toLowerCase()}`);
  }

  const [updatedApp] = await prisma.$transaction([
    prisma.tutorApplication.update({
      where: { id: app.id },
      data: {
        status: TutorApplicationStatus.APPROVED,
        adminNote: opts.adminNote ?? null,
        reviewedById: opts.reviewerId,
        reviewedAt: new Date(),
      },
    }),
    // Only upgrade if currently a plain USER — never overwrite an admin role.
    ...(app.user.role === UserRole.USER
      ? [
          prisma.user.update({
            where: { id: app.userId },
            data: { role: UserRole.TUTOR },
          }),
        ]
      : []),
    prisma.tutorProfile.upsert({
      where: { userId: app.userId },
      create: {
        userId: app.userId,
        bio: app.bio,
        expertise: app.expertise,
      },
      update: {
        bio: app.bio,
        expertise: app.expertise,
      },
    }),
    prisma.notification.create({
      data: {
        userId: app.userId,
        type: NotificationType.SYSTEM,
        title: "You're now a tutor! 🎓",
        message:
          "Your tutor application was approved. Head to /tutor/dashboard to build your first course.",
        data: { applicationId: app.id },
      },
    }),
  ]);

  return updatedApp;
}

export async function rejectTutorApplication(opts: {
  applicationId: string;
  reviewerId: string;
  adminNote?: string | null;
}) {
  const app = await prisma.tutorApplication.findUnique({
    where: { id: opts.applicationId },
  });
  if (!app) throw new Error("Application not found");
  if (app.status !== TutorApplicationStatus.PENDING) {
    throw new Error(`Application is already ${app.status.toLowerCase()}`);
  }
  const [updated] = await prisma.$transaction([
    prisma.tutorApplication.update({
      where: { id: app.id },
      data: {
        status: TutorApplicationStatus.REJECTED,
        adminNote: opts.adminNote ?? null,
        reviewedById: opts.reviewerId,
        reviewedAt: new Date(),
      },
    }),
    prisma.notification.create({
      data: {
        userId: app.userId,
        type: NotificationType.SYSTEM,
        title: "Tutor application update",
        message: opts.adminNote
          ? `Your tutor application was not approved this time. Reviewer note: ${opts.adminNote}`
          : "Your tutor application was not approved this time. You can re-apply later.",
        data: { applicationId: app.id },
      },
    }),
  ]);
  return updated;
}

/** Ensure a user has a TutorProfile row. Used when an admin flips a user's
 *  role to TUTOR via the user-edit modal without going through the application
 *  flow — so the dashboard immediately has a row to display. */
export async function ensureTutorProfile(userId: string) {
  return prisma.tutorProfile.upsert({
    where: { userId },
    create: {
      userId,
      bio: "",
      expertise: [],
    },
    update: {},
  });
}
