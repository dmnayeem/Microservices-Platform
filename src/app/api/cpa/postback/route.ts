import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";
import {
  getCpaPostbackSecret,
  handleCpaPostback,
  isReversalStatus,
  verifyCpaPostback,
} from "@/lib/cpa/postback";

export const dynamic = "force-dynamic";

/**
 * GET|POST /api/cpa/postback — server-to-server conversion notice from a CPA
 * network. Public (no session; listed in `publicApiPrefixes`), authenticated
 * by `sig` (HMAC) or `key` (the secret) — see src/lib/cpa/postback.ts.
 *
 * Params (query string, or form / JSON body on POST):
 *   click | clickId | subid   the CpaClick id we put in {clickId}
 *   txid  | transaction_id    network transaction id (dedup)
 *   payout                    USD the network pays us (optional)
 *   status                    1/approved (default) or reversed/chargeback/2
 *   sig | key                 authentication
 *
 * Replies 200 for everything it understood — including duplicates and unknown
 * clicks — so a network does not retry forever; 403 on a bad signature.
 */
async function readParams(request: NextRequest): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URL(request.url).searchParams) out[k] = v;
  if (request.method === "POST") {
    const type = request.headers.get("content-type") ?? "";
    try {
      if (type.includes("application/json")) {
        const j = (await request.json()) as Record<string, unknown>;
        for (const [k, v] of Object.entries(j ?? {})) if (v != null) out[k] = String(v);
      } else if (type.includes("form")) {
        const f = await request.formData();
        for (const [k, v] of f.entries()) if (typeof v === "string") out[k] = v;
      }
    } catch {
      /* query string only */
    }
  }
  return out;
}

async function handle(request: NextRequest) {
  const limited = enforceRateLimit(request, "cpa_postback", 300, 60_000);
  if (limited) return limited;

  const p = await readParams(request);
  const click = (p.click ?? p.clickId ?? p.clickid ?? p.subid ?? p.sub_id ?? "").trim();
  const txid = (p.txid ?? p.transaction_id ?? p.transactionId ?? "").trim();
  const payoutRaw = (p.payout ?? "").trim();
  const status = p.status ?? "";

  const secret = await getCpaPostbackSecret();
  if (!verifyCpaPostback(secret, { click, txid, payout: payoutRaw, sig: p.sig, key: p.key })) {
    return NextResponse.json({ ok: false, error: "Bad signature" }, { status: 403 });
  }
  if (!click || click.length > 64) {
    return NextResponse.json({ ok: false, error: "Missing click" }, { status: 400 });
  }

  const payout = payoutRaw ? Number(payoutRaw) : null;
  try {
    const r = await handleCpaPostback({
      click,
      txid: txid ? txid.slice(0, 191) : null,
      payout: payout != null && Number.isFinite(payout) ? payout : null,
      reversal: isReversalStatus(status),
    });
    if (r.conversionId && r.outcome !== "DUPLICATE") {
      await writeAudit({
        actorId: null,
        action: `CPA_POSTBACK_${r.outcome}`,
        entity: "CpaConversion",
        entityId: r.conversionId,
        targetUserId: r.userId ?? null,
        summary: `CPA postback: ${r.outcome.toLowerCase()} (click ${click}${txid ? `, txid ${txid}` : ""})`,
        meta: { click, txid: txid || null, payout: payoutRaw || null, status: status || null },
      });
    }
    return NextResponse.json({ ok: r.outcome !== "UNKNOWN_CLICK", outcome: r.outcome });
  } catch (e) {
    console.error("[cpa] postback failed:", e);
    // 500 so the network retries a genuine failure.
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
