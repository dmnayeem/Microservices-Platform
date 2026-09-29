import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import type { Permission } from "@/lib/rbac";
import { hasAudienceKeys, sanitizeTaskAudience } from "@/lib/task-targeting";
import { isValidCpaTemplate } from "@/lib/cpa/link";
import { CPA_STATUSES } from "@/lib/cpa/eligibility";
import { usd } from "@/lib/utils";

/**
 * Admin-side helpers for the CPA module.
 *
 * Permissions: CPA reuses the Offerwall permissions — `offerwalls.view` to
 * read, `offerwalls.manage` to change anything — rather than adding a new one,
 * because a permission here is a type-union member plus entries in every role
 * preset, the label table and the module map. Revenue and profit figures are
 * additionally gated on `finance.view`, like every other money screen.
 */
export const CPA_VIEW: Permission = "offerwalls.view";
export const CPA_MANAGE: Permission = "offerwalls.manage";

export async function requireCpaAdmin(
  permission: Permission
): Promise<{ userId: string } | NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(userId, permission))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { userId };
}

export async function seesMoney(userId: string): Promise<boolean> {
  return can(userId, "finance.view");
}

const nullableTrimmed = (max: number) => z.string().max(max).optional().nullable();

export const cpaOfferSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  network: z.string().trim().min(1, "Network is required").max(80),
  category: nullableTrimmed(60),
  description: nullableTrimmed(5000),
  steps: z.array(z.string().max(300)).max(20).optional(),
  logoUrl: nullableTrimmed(600),
  imageUrl: nullableTrimmed(600),
  trackingUrl: z
    .string()
    .trim()
    .max(2000)
    .refine(isValidCpaTemplate, "Tracking link must be an http(s) URL (macros: {username} {userId} {clickId} {country})"),
  points: z.number().int().min(0).max(10_000_000),
  payoutUsd: z.number().min(0).max(100_000).optional().nullable(),
  estMinutes: z.number().int().min(0).max(100_000).optional().nullable(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  completionMode: z.enum(["PROOF", "POSTBACK"]).optional(),
  autoApproveOnPostback: z.boolean().optional(),
  proofRequired: z.boolean().optional(),
  proofInstructions: nullableTrimmed(2000),
  holdHours: z.number().int().min(0).max(2160).optional(),
  dailyCap: z.number().int().min(1).max(1_000_000).optional().nullable(),
  totalCap: z.number().int().min(1).max(10_000_000).optional().nullable(),
  status: z.enum(CPA_STATUSES).optional(),
  featured: z.boolean().optional(),
  order: z.number().int().min(0).max(99_999).optional(),
});

export type CpaOfferInput = z.infer<typeof cpaOfferSchema>;
export const cpaOfferPatchSchema = cpaOfferSchema.partial();

const blank = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/** Persisted columns for the fields present in `d` (PATCH-safe). */
export function cpaOfferData(
  d: Partial<CpaOfferInput>,
  body: Record<string, unknown>
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const set = <K extends keyof CpaOfferInput>(k: K, f: (v: CpaOfferInput[K]) => unknown = (v) => v) => {
    if (d[k] !== undefined) data[k] = f(d[k] as CpaOfferInput[K]);
  };
  set("title");
  set("network");
  set("category", (v) => blank(v));
  set("description", (v) => blank(v));
  set("steps", (v) => (v ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 20));
  set("logoUrl", (v) => blank(v));
  set("imageUrl", (v) => blank(v));
  set("trackingUrl");
  set("points");
  set("payoutUsd", (v) => v ?? null);
  set("estMinutes", (v) => v ?? null);
  set("difficulty");
  set("completionMode");
  set("autoApproveOnPostback");
  set("proofRequired");
  set("proofInstructions", (v) => blank(v));
  set("holdHours");
  set("dailyCap", (v) => v ?? null);
  set("totalCap", (v) => v ?? null);
  set("status");
  set("featured");
  set("order");
  // Whole audience or none of it — see hasAudienceKeys().
  if (hasAudienceKeys(body)) Object.assign(data, sanitizeTaskAudience(body));
  return data;
}

/** Soft warnings shown to the admin; never block a save. */
export function cpaOfferWarnings(
  o: { points: number; payoutUsd: unknown; completionMode: string; autoApproveOnPostback: boolean },
  pointsPerUsd: number
): string[] {
  const out: string[] = [];
  const payout = o.payoutUsd == null ? null : Number(o.payoutUsd);
  const cost = pointsPerUsd > 0 ? o.points / pointsPerUsd : 0;
  if (payout != null && Number.isFinite(payout) && cost > payout) {
    out.push(
      `Users get ${usd(cost)} in points but the network pays ${usd(payout)} — every conversion loses ${usd(cost - payout)}.`
    );
  }
  if (payout == null) out.push("No network payout set — reports can't show revenue or profit for this offer.");
  if (o.autoApproveOnPostback && o.completionMode !== "POSTBACK") {
    out.push("Auto-approve on postback only applies when completion mode is POSTBACK.");
  }
  return out;
}

/** Parse `from`/`to` query params (YYYY-MM-DD or ISO). `to` is inclusive of its day. */
export function parseRange(sp: URLSearchParams): { gte?: Date; lt?: Date } {
  const r: { gte?: Date; lt?: Date } = {};
  const from = sp.get("from");
  const to = sp.get("to");
  if (from) {
    const d = new Date(from);
    if (!isNaN(d.getTime())) r.gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!isNaN(d.getTime())) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) d.setUTCDate(d.getUTCDate() + 1);
      r.lt = d;
    }
  }
  return r;
}
