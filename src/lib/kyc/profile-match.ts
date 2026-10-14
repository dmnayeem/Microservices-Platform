import "server-only";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { writeAudit } from "@/lib/audit";
import { STAFF_ROLES } from "@/lib/staff";
import { nameMatches, normName } from "@/lib/kyc/auto-verify";

/**
 * The member's profile must say what their verified ID says (owner,
 * 2026-10-15). The profile's identity fields — name, date of birth, NID
 * number — are compared with the latest APPROVED KYC document (what the ID
 * itself reads: `extracted` from the scan, and its number). A real mismatch
 * means fake profile details, and the account is banned (setting
 * `kyc.mismatch_action`: "ban" — the default — or "flag" to only record it).
 *
 * Checked when a member's KYC is approved by the automatic check, and when a
 * member with approved KYC changes one of those fields. An admin's own manual
 * approval is their judgement and is not overridden. Only fields BOTH sides
 * have are compared, and a name only when both are in comparable (Latin)
 * letters, so an unreadable field never bans anybody.
 */

export type MismatchField = "name" | "dateOfBirth" | "nidNumber";

export interface Mismatch {
  field: MismatchField;
  profile: string;
  kyc: string;
}

export interface IdentityProfile {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  dateOfBirth?: Date | string | null;
  nidNumber?: string | null;
}

interface KycIdentity {
  name: string | null;
  dateOfBirth: string | null;
  idNumber: string | null;
}

const FIELD_LABEL: Record<MismatchField, string> = {
  name: "name",
  dateOfBirth: "date of birth",
  nidNumber: "NID number",
};

/** What the member's approved ID says. Null when there is no approved KYC. */
export async function approvedKycIdentity(userId: string): Promise<KycIdentity | null> {
  const doc = await prisma.kYCDocument.findFirst({
    where: { userId, status: "APPROVED" },
    orderBy: { updatedAt: "desc" },
    select: { documentNumber: true, extracted: true },
  });
  if (!doc) return null;
  const e = (doc.extracted ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    name: str(e.fullNameEnglish) ?? str(e.fullName),
    dateOfBirth: str(e.dateOfBirth),
    idNumber: str(doc.documentNumber) ?? str(e.idNumber),
  };
}

const digits = (s: string) => s.replace(/\D/g, "");
const isoDay = (v: Date | string) => {
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

/** Fields where the profile and the verified ID disagree. */
export function compareProfileToKyc(p: IdentityProfile, kyc: KycIdentity): Mismatch[] {
  const out: Mismatch[] = [];

  const profileName = (p.name?.trim() || [p.firstName, p.lastName].filter(Boolean).join(" ").trim()) || "";
  if (profileName && kyc.name && normName(profileName) && normName(kyc.name)) {
    if (!nameMatches(profileName, kyc.name)) out.push({ field: "name", profile: profileName, kyc: kyc.name });
  }

  if (p.dateOfBirth && kyc.dateOfBirth) {
    const a = isoDay(p.dateOfBirth);
    if (a && a !== kyc.dateOfBirth) out.push({ field: "dateOfBirth", profile: a, kyc: kyc.dateOfBirth });
  }

  if (p.nidNumber && kyc.idNumber) {
    const a = digits(p.nidNumber);
    const b = digits(kyc.idNumber);
    // A Bangladesh NID exists as 10, 13 and 17 digits (the 17-digit form is
    // the 13-digit one with the birth year in front), so one ending in the
    // other is the same card.
    const same = a === b || (a.length >= 10 && b.length >= 10 && (a.endsWith(b) || b.endsWith(a)));
    if (a && b && !same) out.push({ field: "nidNumber", profile: p.nidNumber, kyc: kyc.idNumber });
  }
  return out;
}

export function mismatchSentence(m: Mismatch[]): string {
  return m.map((x) => FIELD_LABEL[x.field]).join(", ");
}

/**
 * Compare and act. `profile` may be the values about to be saved (a profile
 * edit) — then nothing is saved by the caller when this returns `banned`.
 */
export async function enforceKycProfileMatch(
  userId: string,
  trigger: "kyc_approved" | "profile_edit",
  profile?: IdentityProfile
): Promise<{ mismatches: Mismatch[]; banned: boolean }> {
  const action = await getSetting<string>("kyc.mismatch_action", "ban").catch(() => "ban");
  if (action === "off") return { mismatches: [], banned: false };

  const [kyc, user] = await Promise.all([
    approvedKycIdentity(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, firstName: true, lastName: true, dateOfBirth: true, nidNumber: true, role: true, status: true },
    }),
  ]);
  if (!kyc || !user) return { mismatches: [], banned: false };

  const mismatches = compareProfileToKyc({ ...user, ...(profile ?? {}) }, kyc);
  if (mismatches.length === 0) return { mismatches, banned: false };

  // Staff are never auto-banned; a mismatch on their account is only recorded.
  const staff = (STAFF_ROLES as readonly string[]).map(String).includes(String(user.role));
  const ban = action === "ban" && !staff && user.status !== "BANNED";
  const what = mismatchSentence(mismatches);

  if (ban) {
    await prisma.user.update({ where: { id: userId }, data: { status: "BANNED" } });
    await prisma.notification
      .create({
        data: {
          userId,
          type: "SYSTEM",
          title: "Account banned",
          message: `Your profile details (${what}) don't match your verified ID (KYC). Accounts with false details are banned. If this is a mistake, contact support.`,
        },
      })
      .catch(() => {});
  }
  await writeAudit({
    actorId: null,
    action: ban ? "USER_BANNED" : "KYC_PROFILE_MISMATCH",
    entity: "User",
    entityId: userId,
    targetUserId: userId,
    summary: `${ban ? "Auto-banned" : "Flagged"}: profile ${what} doesn't match verified ID (${trigger === "kyc_approved" ? "on KYC approval" : "on profile edit"})`,
    meta: { trigger, mismatches, action },
  }).catch(() => {});

  return { mismatches, banned: ban };
}
