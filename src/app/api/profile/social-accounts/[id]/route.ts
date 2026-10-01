import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { screenLinks } from "@/lib/link-safety";

const updateSchema = z.object({
  username: z.string().min(2).max(60).optional(),
  url: z.string().url().nullable().optional(),
  followers: z.number().int().min(0).max(1_000_000_000).optional(),
  following: z.number().int().min(0).max(1_000_000_000).optional(),
  postsCount: z.number().int().min(0).max(1_000_000_000).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const existing = await prisma.socialAccount.findUnique({ where: { id } });
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const v = updateSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = { ...v.data };
  if (typeof data.username === "string") {
    data.username = (data.username as string).replace(/^@/, "").trim();
  }
  data.lastSyncedAt = new Date();

  // Phishing / malware links: the profile link is shown to everyone.
  if (typeof v.data.url === "string") {
    const links = await screenLinks(
      { urls: [v.data.url] },
      { userId: session.user.id, entityType: "profile", entityId: session.user.id }
    );
    if (!links.ok) {
      return NextResponse.json({ error: links.message }, { status: 400 });
    }
  }

  const account = await prisma.socialAccount.update({
    where: { id },
    data,
  });
  return NextResponse.json({ account });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const existing = await prisma.socialAccount.findUnique({ where: { id } });
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.socialAccount.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
