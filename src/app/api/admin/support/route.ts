import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectivePermissions } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

/**
 * Support inbox — the messages users send through the public contact form.
 *
 * Until now `ContactMessage` rows were write-only: `/api/contact` stored them
 * and emailed SUPPORT_EMAIL, which is a no-op when SMTP isn't configured. So
 * every user complaint landed in a table nothing could read.
 */

const STATUSES = ["NEW", "READ", "RESOLVED"] as const;

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(STATUSES),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const perms = await getEffectivePermissions(session.user.id);
  if (!perms.has("support.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const status = STATUSES.includes(statusParam as (typeof STATUSES)[number])
    ? (statusParam as (typeof STATUSES)[number])
    : null;
  const q = (searchParams.get("q") ?? "").trim();

  const where = {
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { subject: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  // Tab counts are always over ALL messages, not the filtered set — otherwise
  // the "New (3)" chip would change meaning as you type in the search box.
  // Three indexed counts (@@index([status, createdAt])) beat a groupBy here.
  const [messages, newCount, readCount, resolvedCount] = await Promise.all([
    prisma.contactMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.contactMessage.count({ where: { status: "NEW" } }),
    prisma.contactMessage.count({ where: { status: "READ" } }),
    prisma.contactMessage.count({ where: { status: "RESOLVED" } }),
  ]);

  return NextResponse.json({
    messages,
    counts: { NEW: newCount, READ: readCount, RESOLVED: resolvedCount },
  });
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const perms = await getEffectivePermissions(session.user.id);
  if (!perms.has("support.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { id, status } = parsed.data;

  const existing = await prisma.contactMessage.findUnique({
    where: { id },
    select: { id: true, subject: true, email: true, status: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.status === status) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const updated = await prisma.contactMessage.update({
    where: { id },
    data: { status },
  });

  await writeAudit({
    actorId: session.user.id,
    action: "SUPPORT_MESSAGE_STATUS",
    entity: "ContactMessage",
    entityId: id,
    summary: `Support message "${existing.subject}" (${existing.email}) → ${status}`,
  }).catch(() => {});

  return NextResponse.json({ ok: true, message: updated });
}
