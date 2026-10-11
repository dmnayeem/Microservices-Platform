import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { contestAdminGuard as engagementGuard } from "@/lib/contests-admin";
import { parseRound } from "@/lib/feedback-admin";
import { npsOf, type FeedbackQuestion } from "@/lib/feedback";

/**
 * GET — the round's results: per question the average (ratings), NPS (0–10),
 * counts (choices) or the written answers; `?format=csv` downloads every
 * response.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await engagementGuard("community.view");
  if ("res" in g) return g.res;
  const { id } = await params;
  const round = await prisma.feedbackRound.findUnique({ where: { id } });
  if (!round) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const responses = await prisma.feedbackResponse.findMany({
    where: { roundId: id },
    orderBy: { createdAt: "asc" },
    take: 10_000,
    select: { userId: true, answers: true, createdAt: true },
  });
  const questions = round.questions as unknown as FeedbackQuestion[];

  if (request.nextUrl.searchParams.get("format") === "csv") {
    const users = await prisma.user.findMany({
      where: { id: { in: responses.map((r) => r.userId) } },
      select: { id: true, email: true },
    });
    const email = new Map(users.map((u) => [u.id, u.email]));
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      ["Answered at", "Email", ...questions.map((q) => q.label)].map(esc).join(","),
      ...responses.map((r) => {
        const a = (r.answers ?? {}) as Record<string, unknown>;
        return [r.createdAt.toISOString(), email.get(r.userId) ?? r.userId, ...questions.map((q) => a[q.id] ?? "")].map(esc).join(",");
      }),
    ];
    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="feedback-${id}.csv"`,
      },
    });
  }

  const summary = questions.map((q) => {
    const vals = responses
      .map((r) => ((r.answers ?? {}) as Record<string, unknown>)[q.id])
      .filter((v) => v !== undefined && v !== null && v !== "");
    if (q.type === "RATING" || q.type === "NPS") {
      const nums = vals.map(Number).filter((n) => Number.isFinite(n));
      const avg = nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : null;
      return { id: q.id, type: q.type, label: q.label, count: nums.length, average: avg, nps: q.type === "NPS" ? npsOf(nums) : null };
    }
    if (q.type === "CHOICE") {
      const counts: Record<string, number> = {};
      for (const o of q.options ?? []) counts[o] = 0;
      for (const v of vals) counts[String(v)] = (counts[String(v)] ?? 0) + 1;
      return { id: q.id, type: q.type, label: q.label, count: vals.length, counts };
    }
    return { id: q.id, type: q.type, label: q.label, count: vals.length, answers: vals.map(String).slice(-200).reverse() };
  });
  return NextResponse.json({ round, responses: responses.length, summary });
}

/** PUT — `{ ...fields }` edits; `{ action: "publish" | "close" | "unpublish" }`. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await engagementGuard("community.manage");
  if ("res" in g) return g.res;
  const { id } = await params;
  const existing = await prisma.feedbackRound.findUnique({ where: { id }, select: { title: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.action === "string") {
    const to = body.action === "publish" ? "PUBLISHED" : body.action === "close" ? "CLOSED" : body.action === "unpublish" ? "DRAFT" : null;
    if (!to) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    await prisma.feedbackRound.update({ where: { id }, data: { status: to } });
    await writeAudit({ actorId: g.userId, action: `FEEDBACK_ROUND_${to}`, entity: "FeedbackRound", entityId: id, summary: `Feedback round "${existing.title}" → ${to}` });
    return NextResponse.json({ ok: true, status: to });
  }
  const p = parseRound(body);
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 });
  const round = await prisma.feedbackRound.update({ where: { id }, data: { ...p.value, questions: p.value.questions as never } });
  await writeAudit({ actorId: g.userId, action: "FEEDBACK_ROUND_UPDATED", entity: "FeedbackRound", entityId: id, summary: `Edited feedback round "${round.title}"` });
  return NextResponse.json({ ok: true, round });
}
