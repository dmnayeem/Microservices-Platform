import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { parseFeatureOverrides } from "@/lib/packages";
import type { PackageFeatureKey } from "@/lib/features";

// The three self-serve selling capabilities an admin can grant per user.
const SELLER_CAPS = ["sellCourses", "sellMarketplace", "advertiser"] as const;
type SellerCap = (typeof SELLER_CAPS)[number];

function sellerFlags(featureOverrides: unknown): Record<SellerCap, boolean> {
  const fo = parseFeatureOverrides(featureOverrides);
  return {
    sellCourses: fo.sellCourses === true,
    sellMarketplace: fo.sellMarketplace === true,
    advertiser: fo.advertiser === true,
  };
}

// GET /api/admin/sellers?search= — search users to grant, or list current sellers.
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "users.edit")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const search = new URL(request.url).searchParams.get("search")?.trim();

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
          { username: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {
        // Current sellers = anyone with a seller feature override set to true.
        OR: SELLER_CAPS.map((cap) => ({
          featureOverrides: { path: [cap], equals: true },
        })),
      };

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: search ? 20 : 100,
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      avatar: true,
      role: true,
      featureOverrides: true,
    },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      username: u.username,
      avatar: u.avatar,
      role: u.role,
      capabilities: sellerFlags(u.featureOverrides),
    })),
  });
}

// POST /api/admin/sellers — grant/revoke ONE selling capability for a user.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "users.edit")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { userId, capability, enabled } = body as {
    userId?: string;
    capability?: string;
    enabled?: boolean;
  };

  if (!userId || !capability || !SELLER_CAPS.includes(capability as SellerCap)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const cap = capability as SellerCap;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, featureOverrides: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const fo = parseFeatureOverrides(user.featureOverrides) as Partial<Record<PackageFeatureKey, boolean>>;
  if (enabled) fo[cap] = true;
  else delete fo[cap]; // revoke = revert to plan/role default (usually off)

  const data: Record<string, unknown> = {
    featureOverrides: Object.keys(fo).length ? fo : null,
  };

  // Granting "Sell Courses" auto-promotes a plain USER to TUTOR so the course
  // tools work immediately (mirrors the user-editor one-click grant).
  let promotedTutor = false;
  if (cap === "sellCourses" && enabled && user.role === "USER") {
    data.role = "TUTOR";
    promotedTutor = true;
  }

  await prisma.user.update({ where: { id: userId }, data });

  if (promotedTutor) {
    const { ensureTutorProfile } = await import("@/lib/tutor-application");
    await ensureTutorProfile(userId);
  }

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: enabled ? "SELLER_ACCESS_GRANTED" : "SELLER_ACCESS_REVOKED",
      entity: "User",
      entityId: userId,
      newData: { capability: cap, enabled: !!enabled, promotedTutor },
    },
  });

  return NextResponse.json({ success: true, capabilities: sellerFlags(data.featureOverrides) });
}
