import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/email";
import { SUPPORT_EMAIL } from "@/config/company";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  subject: z.string().min(1).max(160),
  category: z.string().max(60).optional(),
  message: z.string().min(10).max(5000),
  // Honeypot — real users leave this empty; bots fill it.
  website: z.string().max(0).optional(),
});

// Very light in-memory rate limit per IP (best-effort; resets on redeploy).
const hits = new Map<string, { n: number; at: number }>();
const WINDOW = 60 * 60 * 1000;
const MAX = 5;

// POST /api/contact — public contact form. Stores a ContactMessage and emails
// support when SMTP is configured.
export async function POST(request: NextRequest) {
  const ip = (request.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim() || "unknown";
  const now = Date.now();
  const h = hits.get(ip);
  if (h && now - h.at < WINDOW) {
    if (h.n >= MAX) return NextResponse.json({ error: "Too many messages — please try again later." }, { status: 429 });
    h.n += 1;
  } else {
    hits.set(ip, { n: 1, at: now });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const d = parsed.data;
  if (d.website) return NextResponse.json({ ok: true }); // silently drop bots

  try {
    await prisma.contactMessage.create({
      data: {
        name: d.name.trim(),
        email: d.email.trim(),
        subject: d.subject.trim(),
        category: d.category?.trim() || null,
        message: d.message.trim(),
        ipAddress: ip === "unknown" ? null : ip,
      },
    });
  } catch {
    return NextResponse.json({ error: "Couldn't send your message. Please try again." }, { status: 500 });
  }

  // Best-effort notify support (no-op when SMTP isn't configured).
  sendNotificationEmail(
    SUPPORT_EMAIL,
    `New contact: ${d.subject}`,
    `From ${d.name} <${d.email}>${d.category ? ` · ${d.category}` : ""}\n\n${d.message}`
  ).catch(() => {});

  return NextResponse.json({ ok: true });
}
