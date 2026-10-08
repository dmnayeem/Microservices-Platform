import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { CPA_MANAGE, requireCpaAdmin } from "@/lib/cpa/admin";
import { ensureCpaPostbackSecret, rotateCpaPostbackSecret } from "@/lib/cpa/postback";
import { publicOrigin } from "@/lib/public-origin";

function postbackInfo(request: NextRequest, secret: string) {
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || publicOrigin(request);
  const base = `${origin}/api/cpa/postback`;
  return {
    secret,
    endpoint: base,
    // Networks put their own macro names in place of the {…} placeholders.
    keyUrlTemplate: `${base}?click={clickId}&txid={txid}&payout={payout}&status={status}&key=${secret}`,
    signedUrlTemplate: `${base}?click={clickId}&txid={txid}&payout={payout}&status={status}&sig={hex hmac-sha256(secret, "click:txid:payout")}`,
  };
}

// GET /api/admin/cpa/postback — the postback secret and URL templates. The
// secret is created on the first visit (never by a public request).
export async function GET(request: NextRequest) {
  const gate = await requireCpaAdmin(CPA_MANAGE);
  if (gate instanceof NextResponse) return gate;
  const secret = await ensureCpaPostbackSecret();
  return NextResponse.json(postbackInfo(request, secret));
}

// POST /api/admin/cpa/postback — rotate the secret (old URLs stop working).
export async function POST(request: NextRequest) {
  const gate = await requireCpaAdmin(CPA_MANAGE);
  if (gate instanceof NextResponse) return gate;
  // The env var wins over the stored secret, so a rotation here would show a
  // new secret that every postback is then checked against the OLD one with.
  if (process.env.CPA_POSTBACK_SECRET) {
    return NextResponse.json(
      { error: "The secret is set by the CPA_POSTBACK_SECRET environment variable. Change it there." },
      { status: 409 }
    );
  }
  const secret = await rotateCpaPostbackSecret();
  await writeAudit({
    actorId: gate.userId,
    action: "CPA_POSTBACK_SECRET_ROTATED",
    entity: "SystemSetting",
    entityId: "cpa.postback_secret",
    summary: "Rotated the CPA postback secret",
  });
  return NextResponse.json(postbackInfo(request, secret));
}
