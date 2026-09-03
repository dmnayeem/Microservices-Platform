import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin, type UserRole } from "@/lib/rbac";
import { getPageVisibilityRules } from "@/lib/page-visibility-server";
import {
  computeHiddenPaths,
  parsePageOverrides,
} from "@/lib/page-visibility";
import { getEffectivePackage, packageHasFeature } from "@/lib/packages";
import {
  FEATURE_KEYS,
  parseFeatureOverrides,
  type PackageFeatureKey,
} from "@/lib/features";

/**
 * What one user can currently see, and why.
 *
 * The per-user layer already existed in the resolver but was only reachable
 * from the Edit User modal, where it reads as one more checkbox grid with no
 * indication of what the package and role rules were already doing. This
 * returns both halves — the inherited answer and the user's own overrides — so
 * the admin screen can say "hidden by role" next to "hidden by you", and an
 * override that merely restates the inherited value can be shown as redundant
 * rather than looking like it is doing the work.
 *
 * Super-admin only: page visibility is a platform-wide control.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSuperAdmin(session.user.role as UserRole | undefined)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      avatar: true,
      role: true,
      pageOverrides: true,
      featureOverrides: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const [rules, pkg] = await Promise.all([
    getPageVisibilityRules(),
    getEffectivePackage(id).catch(() => null),
  ]);

  const pageOverrides = parsePageOverrides(user.pageOverrides);
  const featureOverrides = parseFeatureOverrides(user.featureOverrides);

  // The same call the app itself makes, minus the user's own overrides — that
  // is the "inherited" baseline the UI compares against.
  const inheritedHidden = computeHiddenPaths(rules, pkg?.slug ?? null, user.role);
  const effectiveHidden = computeHiddenPaths(
    rules,
    pkg?.slug ?? null,
    user.role,
    pageOverrides
  );

  const inheritedFeatures: Record<string, boolean> = {};
  for (const key of FEATURE_KEYS) {
    inheritedFeatures[key] = packageHasFeature(pkg, key as PackageFeatureKey);
  }

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      avatar: user.avatar,
      role: user.role,
    },
    packageSlug: pkg?.slug ?? null,
    packageName: pkg?.name ?? null,
    inheritedHidden,
    effectiveHidden,
    pageOverrides,
    inheritedFeatures,
    featureOverrides,
  });
}
