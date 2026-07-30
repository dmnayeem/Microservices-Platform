import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { NotificationType } from "@/generated/prisma";
import { renderCertificatePdf } from "@/lib/certificate-pdf";
import { uploadFile, getPublicUrl, isS3Configured } from "@/lib/s3";

/** Determine whether the given enrollment is eligible for a certificate.
 *  Eligible when: all lessons completed AND all quizzes passed at least once. */
export async function isCertificateEligible(enrollmentId: string): Promise<{
  eligible: boolean;
  reason?: string;
}> {
  const enrollment = await prisma.courseEnrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      userId: true,
      courseId: true,
      progress: true,
      course: { select: { certificateEnabled: true } },
    },
  });
  if (!enrollment) return { eligible: false, reason: "Enrollment not found" };
  if (!enrollment.course?.certificateEnabled) {
    return { eligible: false, reason: "Certificate disabled" };
  }
  if (enrollment.progress < 100) {
    return { eligible: false, reason: "Course not fully complete" };
  }
  // Every quiz on the course must have at least one passing attempt by the user.
  const quizzes = await prisma.courseQuiz.findMany({
    where: { courseId: enrollment.courseId },
    select: { id: true },
  });
  if (quizzes.length > 0) {
    const passes = await prisma.courseQuizAttempt.findMany({
      where: {
        userId: enrollment.userId,
        passed: true,
        quizId: { in: quizzes.map((q) => q.id) },
      },
      select: { quizId: true },
    });
    const passedSet = new Set(passes.map((p) => p.quizId));
    const missing = quizzes.filter((q) => !passedSet.has(q.id));
    if (missing.length > 0) {
      return {
        eligible: false,
        reason: `${missing.length} quiz${missing.length === 1 ? "" : "zes"} still need a passing score`,
      };
    }
  }
  return { eligible: true };
}

/** Generate a public, opaque-but-readable serial for a certificate. */
function generateSerial(): string {
  // 6 hex chars × 2 groups — long enough to be unguessable, short enough to read.
  const raw = crypto.randomBytes(8).toString("hex").toUpperCase();
  return `CERT-${raw.slice(0, 6)}-${raw.slice(6, 12)}`;
}

/** Issue (or fetch existing) certificate for an eligible enrollment.
 *  Idempotent — calling twice returns the same row. */
export async function issueCertificate(enrollmentId: string) {
  const enrollment = await prisma.courseEnrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      userId: true,
      courseId: true,
      course: { select: { title: true } },
      user: { select: { name: true } },
    },
  });
  if (!enrollment) throw new Error("Enrollment not found");

  // Already issued?
  const existing = await prisma.courseCertificate.findUnique({
    where: {
      courseId_userId: {
        courseId: enrollment.courseId,
        userId: enrollment.userId,
      },
    },
  });
  if (existing) return existing;

  const elig = await isCertificateEligible(enrollmentId);
  if (!elig.eligible) {
    throw new Error(elig.reason ?? "Not eligible for certificate");
  }

  // Unique serial — retry once on collision (vanishingly small)
  let serial = generateSerial();
  let attempts = 0;
  while (attempts < 5) {
    const clash = await prisma.courseCertificate.findUnique({
      where: { serial },
      select: { id: true },
    });
    if (!clash) break;
    serial = generateSerial();
    attempts += 1;
  }
  const sharedUrl = `/certificates/${serial}`;

  const cert = await prisma.courseCertificate.create({
    data: {
      courseId: enrollment.courseId,
      userId: enrollment.userId,
      serial,
      sharedUrl,
    },
  });

  // Render + store the PDF (best-effort; failure doesn't block issuance).
  if (isS3Configured()) {
    try {
      const pdf = await renderCertificatePdf({
        recipientName: enrollment.user?.name ?? "Student",
        courseTitle: enrollment.course?.title ?? "Course",
        serial,
        issuedAt: cert.issuedAt,
      });
      const key = `certificates/${serial}.pdf`;
      const up = await uploadFile(key, pdf, "application/pdf");
      const url = up.success ? (up.url ?? getPublicUrl(key)) : null;
      if (url) {
        await prisma.courseCertificate.update({
          where: { id: cert.id },
          data: { pdfUrl: url },
        });
        cert.pdfUrl = url;
      }
    } catch (err) {
      console.error("Certificate PDF generation failed:", err);
    }
  }

  // Notify the student
  await prisma.notification.create({
    data: {
      userId: enrollment.userId,
      type: NotificationType.COURSE,
      title: "Certificate ready 🏆",
      message: `You earned a certificate of completion for "${enrollment.course?.title ?? "your course"}".`,
      data: { courseId: enrollment.courseId, certificateId: cert.id, serial },
    },
  });

  return cert;
}

/** Tries to issue a certificate; swallows ineligibility so the caller can
 *  fire-and-forget from the lesson-complete + quiz-attempt code paths. */
export async function maybeIssueCertificate(enrollmentId: string): Promise<void> {
  try {
    const elig = await isCertificateEligible(enrollmentId);
    if (!elig.eligible) return;
    await issueCertificate(enrollmentId);
  } catch (err) {
    // Don't poison the calling write — just log.
    console.error("maybeIssueCertificate failed:", err);
  }
}
