import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audienceWhereResolved } from "@/lib/audience";
import { sanitizeTaskAudience } from "@/lib/task-targeting";
import { CPA_VIEW, requireCpaAdmin } from "@/lib/cpa/admin";

// POST /api/admin/cpa/offers/audience-count — how many ACTIVE users a targeting
// set reaches. Body: the nine audience keys (countries, genders, regions,
// divisions, districts, subDistricts, postalCodes, minAge, maxAge).
//
// An estimate from the shared user-segment matcher (audienceWhereResolved), the
// same one broadcasts use; serving itself is STRICT per task-targeting.
export async function POST(request: NextRequest) {
  const gate = await requireCpaAdmin(CPA_VIEW);
  if (gate instanceof NextResponse) return gate;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const a = sanitizeTaskAudience(body);
  const where = await audienceWhereResolved({
    countries: a.countries,
    genders: a.genders,
    regions: a.regions,
    divisions: a.divisions,
    districts: a.districts,
    subDistricts: a.subDistricts,
    postalCodes: a.postalCodes,
    minAge: a.minAge ?? undefined,
    maxAge: a.maxAge ?? undefined,
  });
  const [count, total] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.count({ where: { status: "ACTIVE" } }),
  ]);
  return NextResponse.json({ count, total });
}
