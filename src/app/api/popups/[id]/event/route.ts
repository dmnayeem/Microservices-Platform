import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";

/** Session cookie listing the popup events this browser was already counted for. */
const SEEN_COOKIE = "pp_ev";
/** Bounded so the cookie stays small; the oldest entries drop off first. */
const SEEN_MAX = 40;

// POST /api/popups/:id/event { type: "view" | "click" } — the counters shown
// on /admin/popups. Public (visitors see popups too) and best-effort: a
// throttled or failed count never affects the page.
//
// Deduplicated per browser session: each (popup, event) is counted once per
// session. Without it every page load (and every repeat click) inflated the
// counters, so "views" was really "page loads with the popup on".
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = enforceRateLimit(request, "popup-event", 60, 60_000);
  if (limited) return limited;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const type = (body as { type?: string }).type;
  if (type !== "view" && type !== "click") {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  const token = `${type === "view" ? "v" : "c"}:${id}`.slice(0, 80);
  const seen = (request.cookies.get(SEEN_COOKIE)?.value ?? "")
    .split("|")
    .filter(Boolean);
  if (seen.includes(token)) {
    return NextResponse.json({ ok: true, counted: false });
  }

  await prisma.sitePopup
    .update({
      where: { id },
      data: type === "view" ? { views: { increment: 1 } } : { clicks: { increment: 1 } },
      select: { id: true },
    })
    .catch(() => null);

  const res = NextResponse.json({ ok: true, counted: true });
  // No maxAge/expires → a session cookie: cleared when the browser closes.
  res.cookies.set(SEEN_COOKIE, [...seen, token].slice(-SEEN_MAX).join("|"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/popups",
  });
  return res;
}
