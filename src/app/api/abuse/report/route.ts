import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { recordAbuseSignalForCase } from "@/lib/abuse/cases";

/**
 * POST /api/abuse/report — the public form on /abuse.
 *
 * Anyone may use it (a rights holder, a host, a visitor), so it is public in
 * the middleware allowlist. No captcha: a honeypot field plus a per-IP limit.
 * It only ever OPENS a case — nothing is hidden or suspended from here unless
 * an admin acts (or the owner turns on the critical-signal rules, and a public
 * report is never above HIGH).
 */
const schema = z.object({
  type: z.enum(["copyright", "malware", "phishing", "spam", "fraud", "illegal", "other"]),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  organization: z.string().trim().max(160).optional(),
  urls: z.string().trim().min(4).max(4000),
  description: z.string().trim().min(10).max(5000),
  // DMCA-style fields — required for a copyright notice, ignored otherwise.
  originalWork: z.string().trim().max(2000).optional(),
  goodFaith: z.boolean().optional(),
  accurate: z.boolean().optional(),
  signature: z.string().trim().max(160).optional(),
  providerRef: z.string().trim().max(200).optional(),
  // Honeypot — real people leave it empty.
  website: z.string().max(0).optional(),
});

const SEVERITY: Record<string, "MEDIUM" | "HIGH"> = {
  malware: "HIGH",
  phishing: "HIGH",
  illegal: "HIGH",
  copyright: "MEDIUM",
  fraud: "MEDIUM",
  spam: "MEDIUM",
  other: "MEDIUM",
};

/** A platform URL naming a post / listing / task / profile, so the case lands on it. */
function entityFromUrls(urls: string): { entityType?: string; entityId?: string } {
  const m =
    urls.match(/\/post\/([A-Za-z0-9_-]{8,40})/) ??
    urls.match(/\/feed\/([A-Za-z0-9_-]{8,40})/);
  if (m) return { entityType: "post", entityId: m[1] };
  const l = urls.match(/\/marketplace\/(?:listing\/)?([a-z0-9]{20,40})/);
  if (l) return { entityType: "listing", entityId: l[1] };
  return {};
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rl = rateLimit(`abuse-report:${ip}`, 5, 60 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many reports from this network. Try again in ${Math.ceil(rl.retryAfterSec / 60)} min.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }
  const v = schema.safeParse(await req.json().catch(() => ({})));
  if (!v.success) return NextResponse.json({ error: v.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const d = v.data;
  if (d.website) return NextResponse.json({ ok: true }); // bot: drop quietly

  if (d.type === "copyright" && (!d.originalWork || !d.goodFaith || !d.accurate || !d.signature)) {
    return NextResponse.json(
      { error: "A copyright notice needs the original work, both statements ticked and your signature." },
      { status: 400 }
    );
  }

  const fromProvider = !!d.organization || !!d.providerRef;
  const caseId = await recordAbuseSignalForCase({
    kind: fromProvider ? "PROVIDER_COMPLAINT" : "USER_REPORT",
    severity: SEVERITY[d.type] ?? "MEDIUM",
    ...entityFromUrls(d.urls),
    summary: `Public ${d.type} report from ${d.organization || d.name}: ${d.description.slice(0, 160)}`,
    evidence: {
      source: "public_form",
      type: d.type,
      reporter: { name: d.name, email: d.email, organization: d.organization ?? null, ip: ip === "unknown" ? null : ip },
      urls: d.urls,
      description: d.description,
      providerRef: d.providerRef ?? null,
      ...(d.type === "copyright"
        ? { dmca: { originalWork: d.originalWork, goodFaith: d.goodFaith, accurate: d.accurate, signature: d.signature } }
        : {}),
      userAgent: req.headers.get("user-agent"),
    },
  });
  if (!caseId) return NextResponse.json({ error: "Couldn't file the report. Please email us instead." }, { status: 500 });
  return NextResponse.json({ ok: true, reference: caseId.slice(-8).toUpperCase() });
}
