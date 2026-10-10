import "server-only";
import { NextResponse } from "next/server";
import { userCanFeature } from "@/lib/packages";
import { FEATURES, type PackageFeatureKey } from "@/lib/features";

/**
 * Refuse a request when the person's plan (or their per-user override) does
 * not include this feature — Admin → Packages switches. The menu hides the
 * page too (lib/nav-config.ts), but the API is the boundary that matters.
 */
export async function planFeatureGate(userId: string, feature: PackageFeatureKey): Promise<NextResponse | null> {
  if (await userCanFeature(userId, feature)) return null;
  const label = FEATURES.find((f) => f.key === feature)?.label ?? feature;
  return NextResponse.json(
    { error: `${label} isn't included in your plan. Upgrade your package to use it.`, code: "PLAN_FEATURE", feature },
    { status: 403 }
  );
}
