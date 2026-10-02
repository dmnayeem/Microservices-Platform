import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/require-active";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { effectiveCountry } from "@/lib/effective-country";
import { checkCpaEligibility, loadCpaViewer } from "@/lib/cpa/eligibility";
import { buildCpaTrackingUrl } from "@/lib/cpa/link";
import { getProfileGateState } from "@/lib/profile-gate-server";
import { publicOrigin } from "@/lib/public-origin";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /go/cpa/:offerId — "Start" on a CPA offer.
 *
 * Signed-in only. Checks the offer is open to this user, records a CpaClick
 * (its id is the {clickId} the network echoes back) and 302s to the filled
 * tracking link. The template itself is never sent to the browser.
 *
 * Any refusal redirects back to `/cpa/<offerId>?error=<REASON>` (reasons:
 * NOT_FOUND, INACTIVE, AUDIENCE, TOTAL_CAP, DAILY_CAP, ALREADY, RETRY_LATER,
 * PROFILE_INCOMPLETE, BLOCKED, RATE_LIMITED, BAD_LINK) so the UI can explain it.
 *
 * After a rejection, Start works again only once the retry wait is over
 * (RETRY_LATER before). The profile gate ("cpa", covered by "tasks") applies to
 * a fresh Start; a user who already started this attempt may open it again.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const back = (reason: string) =>
    NextResponse.redirect(new URL(`/cpa/${encodeURIComponent(id)}?error=${reason}`, publicOrigin(request)), 302);

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    const login = new URL("/login", publicOrigin(request));
    login.searchParams.set("callbackUrl", `/go/cpa/${id}`);
    return NextResponse.redirect(login, 302);
  }

  const active = await requireActiveUser(userId);
  if (!active.ok) return back("BLOCKED");

  if (enforceRateLimit(request, `cpa_go:${userId}`, 20, 60_000)) return back("RATE_LIMITED");

  const viewer = await loadCpaViewer(userId);
  if (!viewer) return back("BLOCKED");

  const offer = await prisma.cpaOffer.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      trackingUrl: true,
      totalCap: true,
      dailyCap: true,
      conversionsCount: true,
      countries: true,
      genders: true,
      regions: true,
      divisions: true,
      districts: true,
      subDistricts: true,
      postalCodes: true,
      minAge: true,
      maxAge: true,
    },
  });
  const gate = await checkCpaEligibility(offer, viewer);
  if (!gate.ok || !offer) return back(gate.ok ? "NOT_FOUND" : gate.reason);

  const profile = await getProfileGateState(userId, "cpa");
  if (profile.locked) {
    // Already started this attempt (a click since the last rejection, if any)?
    // Then it is in progress, and a rule switched on since does not stop it.
    const mine = await prisma.cpaConversion.findUnique({
      where: { offerId_userId: { offerId: offer.id, userId } },
      select: { reviewedAt: true },
    });
    const started = await prisma.cpaClick.findFirst({
      where: {
        offerId: offer.id,
        userId,
        ...(mine?.reviewedAt ? { createdAt: { gt: mine.reviewedAt } } : {}),
      },
      select: { id: true },
    });
    if (!started) return back("PROFILE_INCOMPLETE");
  }

  const country = effectiveCountry(viewer) ?? "";
  const click = await prisma.cpaClick.create({
    data: {
      offerId: offer.id,
      userId,
      username: viewer.username ?? null,
      country: country || null,
      district: viewer.district ?? null,
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
    },
    select: { id: true },
  });

  const url = buildCpaTrackingUrl(offer.trackingUrl, {
    username: viewer.username ?? "",
    userId,
    clickId: click.id,
    country,
  });
  if (!url) return back("BAD_LINK");

  const res = NextResponse.redirect(url, 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
