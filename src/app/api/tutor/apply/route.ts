import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { createTutorApplication } from "@/lib/tutor-application";
import { checkAnswers, requirementsRefusal } from "@/lib/application-requirements-server";
import { answersToText } from "@/lib/application-requirements";

const applySchema = z.object({
  bio: z.string().min(50, "Bio must be at least 50 characters").max(2000),
  expertise: z.array(z.string().min(1).max(60)).min(1).max(10),
  sampleOutline: z.string().max(4000).optional().nullable(),
  portfolioUrl: z.string().url().optional().nullable().or(z.literal("")),
  idDocumentUrl: z.string().url().optional().nullable().or(z.literal("")),
  answers: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

// GET /api/tutor/apply — fetch current user's latest application (if any)
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const [latest, profile, user] = await Promise.all([
      prisma.tutorApplication.findFirst({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.tutorProfile.findUnique({ where: { userId: session.user.id } }),
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true },
      }),
    ]);
    return NextResponse.json({
      application: latest,
      profile,
      role: user?.role ?? "USER",
    });
  } catch (error) {
    console.error("Get tutor application failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

// POST /api/tutor/apply — submit a new application
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const v = applySchema.safeParse(body);
    if (!v.success) {
      return NextResponse.json(
        { error: "Invalid input", details: v.error.issues },
        { status: 400 }
      );
    }
    // Block if user is already a tutor / admin
    const u = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    if (!u) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (u.role !== "USER") {
      return NextResponse.json(
        { error: `Your role (${u.role}) cannot apply to be a tutor.` },
        { status: 400 }
      );
    }
    const refusal = await requirementsRefusal(session.user.id, "TUTOR");
    if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
    const qa = await checkAnswers("TUTOR", v.data.answers);
    if (!qa.ok) return NextResponse.json({ error: qa.error }, { status: 400 });
    // TutorApplication has no JSON column: the answers ride on the outline
    // as a readable block (split back out on the admin page).
    const outline = `${v.data.sampleOutline ?? ""}${answersToText(qa.answers)}`.trim();
    const app = await createTutorApplication(session.user.id, {
      bio: v.data.bio,
      expertise: v.data.expertise,
      sampleOutline: outline || null,
      portfolioUrl: v.data.portfolioUrl || null,
      idDocumentUrl: v.data.idDocumentUrl || null,
    });
    return NextResponse.json({ application: app }, { status: 201 });
  } catch (error) {
    console.error("Submit tutor application failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
