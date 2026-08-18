import type { Prisma } from "@/generated/prisma/client";

/**
 * ONE demographic/location audience matcher — turns a segment definition into a
 * Prisma `User` where-clause. Used for data-wise push/marketing notifications
 * (and reusable for ads/surveys). All dimensions map to indexed `User` columns
 * (see the demographic indexes on the User model) so segmenting scales.
 * An empty criteria object → all ACTIVE users.
 */
export interface AudienceCriteria {
  countries?: string[]; // ISO2, matches User.country
  regions?: string[]; // state (non-BD)
  divisions?: string[]; // BD division
  districts?: string[];
  subDistricts?: string[]; // upazila / thana
  cities?: string[];
  postalCodes?: string[];
  genders?: string[]; // MALE / FEMALE / OTHER
  minAge?: number;
  maxAge?: number;
  tags?: string[]; // interests — any-of
  languages?: string[]; // User.language
  packages?: string[]; // package slug
  minLevel?: number;
  maxLevel?: number;
  kycStatuses?: string[];
  verifiedOnly?: boolean;
  activeWithinDays?: number;
}

const ci = (vals?: string[]) =>
  vals && vals.length ? { in: vals, mode: "insensitive" as const } : undefined;

export function audienceWhere(c: AudienceCriteria = {}): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = { status: "ACTIVE" };

  if (c.countries?.length) where.country = { in: c.countries, mode: "insensitive" };
  if (c.regions?.length) where.region = ci(c.regions);
  if (c.divisions?.length) where.division = ci(c.divisions);
  if (c.districts?.length) where.district = ci(c.districts);
  if (c.subDistricts?.length) where.subDistrict = ci(c.subDistricts);
  if (c.cities?.length) where.city = ci(c.cities);
  if (c.postalCodes?.length) where.postalCode = { in: c.postalCodes };
  if (c.genders?.length) where.gender = { in: c.genders, mode: "insensitive" };
  if (c.languages?.length) where.language = { in: c.languages };
  if (c.tags?.length) where.tags = { hasSome: c.tags };
  if (c.packages?.length) where.package = { slug: { in: c.packages } };
  if (c.kycStatuses?.length)
    where.kycStatus = { in: c.kycStatuses as unknown as Prisma.EnumKYCStatusFilter["in"] };
  if (c.verifiedOnly) where.isBlueVerified = true;

  if (c.minLevel || c.maxLevel) {
    const lvl: Prisma.IntFilter = {};
    if (c.minLevel) lvl.gte = c.minLevel;
    if (c.maxLevel) lvl.lte = c.maxLevel;
    where.level = lvl;
  }

  if (c.activeWithinDays && c.activeWithinDays > 0) {
    const since = new Date();
    since.setDate(since.getDate() - c.activeWithinDays);
    where.lastLoginAt = { gte: since };
  }

  // Age → date-of-birth window. A user is N years old when their DOB is in
  // (now - (N+1) years, now - N years]. minAge = youngest allowed, maxAge = oldest.
  if (c.minAge != null || c.maxAge != null) {
    const now = new Date();
    const dob: Prisma.DateTimeFilter = {};
    if (c.minAge != null) {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - c.minAge);
      dob.lte = d; // born at least minAge years ago
    }
    if (c.maxAge != null) {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - c.maxAge - 1);
      dob.gt = d; // born less than (maxAge+1) years ago
    }
    where.dateOfBirth = dob;
  }

  return where;
}

/** True when the criteria actually narrows the audience (else = everyone). */
export function hasAudienceCriteria(c: AudienceCriteria = {}): boolean {
  return Object.entries(c).some(([, v]) =>
    Array.isArray(v) ? v.length > 0 : v != null && v !== 0 && v !== false
  );
}
