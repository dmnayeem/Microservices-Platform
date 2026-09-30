import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { screenLinks } from "@/lib/link-safety";

const PLATFORMS = [
  "TWITTER",
  "FACEBOOK",
  "INSTAGRAM",
  "YOUTUBE",
  "TIKTOK",
  "LINKEDIN",
  "TELEGRAM",
  "DISCORD",
] as const;

const PLATFORM_BASE: Record<(typeof PLATFORMS)[number], (handle: string) => string> = {
  TWITTER: (h) => `https://twitter.com/${h.replace(/^@/, "")}`,
  FACEBOOK: (h) => `https://facebook.com/${h.replace(/^@/, "")}`,
  INSTAGRAM: (h) => `https://instagram.com/${h.replace(/^@/, "")}`,
  YOUTUBE: (h) => `https://youtube.com/@${h.replace(/^@/, "")}`,
  TIKTOK: (h) => `https://tiktok.com/@${h.replace(/^@/, "")}`,
  LINKEDIN: (h) => `https://linkedin.com/in/${h.replace(/^@/, "")}`,
  TELEGRAM: (h) => `https://t.me/${h.replace(/^@/, "")}`,
  DISCORD: (h) => `https://discord.com/users/${h.replace(/^@/, "")}`,
};

const connectSchema = z.object({
  platform: z.enum(PLATFORMS),
  username: z.string().min(2).max(60),
  url: z.string().url().optional().nullable(),
  followers: z.number().int().min(0).max(1_000_000_000).optional(),
  following: z.number().int().min(0).max(1_000_000_000).optional(),
  postsCount: z.number().int().min(0).max(1_000_000_000).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const accounts = await prisma.socialAccount.findMany({
    where: { userId: session.user.id },
    orderBy: { connectedAt: "asc" },
  });
  return NextResponse.json({ accounts });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const v = connectSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }

  const { platform, username, url, followers, following, postsCount } = v.data;
  const handle = username.replace(/^@/, "").trim();
  const computedUrl = url ?? PLATFORM_BASE[platform](handle);

  // Phishing / malware links: the profile link is shown to everyone.
  const links = await screenLinks(
    { urls: [computedUrl] },
    { userId: session.user.id, entityType: "profile", entityId: session.user.id }
  );
  if (!links.ok) {
    return NextResponse.json({ error: links.message }, { status: 400 });
  }

  const account = await prisma.socialAccount.upsert({
    where: { userId_platform: { userId: session.user.id, platform } },
    create: {
      userId: session.user.id,
      platform,
      username: handle,
      url: computedUrl,
      followers: followers ?? 0,
      following: following ?? 0,
      postsCount: postsCount ?? 0,
    },
    update: {
      username: handle,
      url: computedUrl,
      followers: followers ?? 0,
      following: following ?? 0,
      postsCount: postsCount ?? 0,
    },
  });

  return NextResponse.json({ account }, { status: 201 });
}
