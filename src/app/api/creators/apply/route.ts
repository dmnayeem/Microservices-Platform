import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createCreatorApplication, CREATOR_TYPES } from "@/lib/creator-application";
import { checkAnswers, requirementsRefusal } from "@/lib/application-requirements-server";
import type { CreatorApplicationType, Prisma } from "@/generated/prisma";

const applySchema = z.object({
  // Every creator type — a hard-coded list here once left TASK_BUYER (and then
  // SERVICE_PROVIDER) failing with "Invalid input" while the page offered them.
  type: z.string().refine((t): t is CreatorApplicationType => t in CREATOR_TYPES, "Unknown application type."),
  message: z.string().trim().min(20, "Tell us a bit more (min 20 chars).").max(2000),
  links: z.array(z.string().url()).max(6).optional(),
  payload: z.record(z.string(), z.string().max(1000)).optional(),
  /** Answers to the program's custom questions, keyed by question id. */
  answers: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

// POST /api/creators/apply — submit a creator/seller application.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { type, message, links, payload, answers } = parsed.data;
  const refusal = await requirementsRefusal(session.user.id, type as CreatorApplicationType);
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
  const qa = await checkAnswers(type as CreatorApplicationType, answers);
  if (!qa.ok) return NextResponse.json({ error: qa.error }, { status: 400 });
  const stored = {
    ...(payload ?? {}),
    ...(qa.answers.length ? { answers: qa.answers } : {}),
  } as Prisma.InputJsonValue;
  try {
    const app = await createCreatorApplication(
      session.user.id,
      type as CreatorApplicationType,
      { message, links, payload: payload || qa.answers.length ? stored : null }
    );
    return NextResponse.json({ application: { id: app.id, status: app.status } }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to apply" },
      { status: 400 }
    );
  }
}
