import { matchesTaskAudience, type TaskAudience, type TaskAudienceUser } from "@/lib/task-targeting";

/**
 * Who a banner is shown to: the task audience (country, region, division,
 * district, upazila, postal code, gender, age — STRICT, see task-targeting.ts)
 * plus KYC status. Client-safe: no Prisma.
 *
 * Matched in memory, not in the query: the banner list is one cached read
 * shared by every viewer, and a per-viewer WHERE would split that cache into
 * one entry per profile.
 */

export const KYC_AUDIENCES = ["ANY", "VERIFIED", "NOT_VERIFIED"] as const;
export type KycAudience = (typeof KYC_AUDIENCES)[number];

export function sanitizeKycAudience(v: unknown): KycAudience {
  return (KYC_AUDIENCES as readonly string[]).includes(String(v)) ? (v as KycAudience) : "ANY";
}

export interface BannerViewer extends TaskAudienceUser {
  kycStatus?: string | null;
}

export function bannerMatches(banner: TaskAudience & { kycAudience?: string | null }, viewer: BannerViewer): boolean {
  const kyc = sanitizeKycAudience(banner.kycAudience);
  const verified = viewer.kycStatus === "APPROVED";
  if (kyc === "VERIFIED" && !verified) return false;
  if (kyc === "NOT_VERIFIED" && verified) return false;
  return matchesTaskAudience(banner, viewer);
}
