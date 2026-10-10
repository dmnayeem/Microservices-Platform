import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { csvFilename, csvResponse, toCsv } from "@/lib/csv";
import { sourceLabel } from "@/lib/signup-source";
import { userDisplayId } from "@/lib/display-id";

// GET /api/admin/signup-sources/export?range=30&source=facebook — every new
// account in the range (optionally one source) with where it came from and how
// it went: verified, did a task, active in the last 7 days. Same filters as
// /admin/signup-sources.
const RANGE_DAYS: Record<string, number | null> = { "7": 7, "30": 30, "90": 90, "365": 365, all: null };
const MAX_ROWS = 50_000;

type Row = {
  id: string;
  name: string | null;
  email: string;
  createdAt: Date;
  signupSource: string | null;
  signupMedium: string | null;
  signupCampaign: string | null;
  signupReferrer: string | null;
  signupLanding: string | null;
  signupCountry: string | null;
  verified: boolean;
  worked: boolean;
  active7: boolean;
};

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "analytics.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const rangeId = sp.get("range") ?? "30";
  const days = rangeId in RANGE_DAYS ? RANGE_DAYS[rangeId] : 30;
  const since = days ? new Date(Date.now() - days * 86_400_000) : new Date(0);
  const src = sp.get("source");
  const source = src && /^[a-z0-9._-]{1,40}$/.test(src) ? src : null;

  const rows = await prisma.$queryRaw<Row[]>`
    SELECT u.id, u.name, u.email, u."createdAt", u."signupSource", u."signupMedium", u."signupCampaign",
      u."signupReferrer", u."signupLanding", u."signupCountry",
      (u."emailVerified" IS NOT NULL) AS verified,
      EXISTS (SELECT 1 FROM "TaskSubmission" t WHERE t."userId" = u.id AND t.status IN ('APPROVED', 'AUTO_APPROVED')) AS worked,
      EXISTS (SELECT 1 FROM "UserActiveDay" a WHERE a."userId" = u.id AND a.date >= CURRENT_DATE - 7) AS active7
    FROM "User" u
    WHERE u.role IN ('USER', 'TUTOR', 'AGENCY')
      AND u.email NOT LIKE '%@deleted.local'
      AND u."createdAt" >= ${since}
      AND (${source}::text IS NULL OR COALESCE(u."signupSource", 'unknown') = ${source})
    ORDER BY u."createdAt" DESC
    LIMIT ${MAX_ROWS}`;

  const yes = (b: boolean) => (b ? "Yes" : "No");
  const csv = toCsv(
    [
      "User ID",
      "Name",
      "Email",
      "Joined",
      "Came from",
      "Type",
      "Campaign",
      "Site / app",
      "First page",
      "Sign-up country",
      "Email verified",
      "Did a task",
      "Active last 7 days",
    ],
    rows.map((r) => [
      userDisplayId(r.id),
      r.name,
      r.email,
      r.createdAt.toISOString(),
      sourceLabel(r.signupSource),
      r.signupMedium,
      r.signupCampaign,
      r.signupReferrer,
      r.signupLanding,
      r.signupCountry,
      yes(r.verified),
      yes(r.worked),
      yes(r.active7),
    ])
  );

  await writeAudit({
    actorId: session.user.id,
    action: "SIGNUP_SOURCES_EXPORTED",
    entity: "User",
    entityId: "signup-sources-export",
    summary: `Exported ${rows.length} account(s) with their sign-up source`,
    meta: { range: rangeId, source },
  });

  return csvResponse(csv, csvFilename(source ? `signup-sources-${source}` : "signup-sources"));
}
