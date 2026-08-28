import "server-only";
import { prisma } from "@/lib/prisma";
import { recordFraudEvent } from "@/lib/fraud";

/**
 * One national ID, one verified account.
 *
 * Before this there was no document-number column anywhere: `KYCDocument` kept
 * the ID only inside its `extracted` JSON and only when OCR had run, and the
 * manual route captured nothing at all. `User.nidNumber` existed but was not
 * unique, not indexed, and never compared against anything — so the same NID
 * could verify unlimited accounts and nothing noticed.
 *
 * Every path that accepts or approves a document goes through `checkDocumentNumber`,
 * so none of them is a bypass. `User.nidNumber` is additionally `@unique`, which
 * means a future path that forgets to call this still cannot create a duplicate —
 * the database is the backstop, not the guard.
 */

/**
 * Strip everything that is formatting rather than identity.
 *
 * People type the same ID as `1234 5678 9012`, `1234-5678-9012` and
 * `123456789012`; without this they would be three different numbers and the
 * whole check would be trivially defeated by adding a space.
 */
export function normalizeDocumentNumber(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/[\s\-_./\\]/g, "").toUpperCase();
}

/** Long enough to identify a person; short enough to be a real document number. */
export function isPlausibleDocumentNumber(normalized: string): boolean {
  return normalized.length >= 6 && normalized.length <= 40;
}

export interface DocumentNumberCheck {
  ok: boolean;
  normalized: string;
  /** Set when the number is already verified against a different account. */
  conflictUserId?: string;
  reason?: "EMPTY" | "IMPLAUSIBLE" | "DUPLICATE";
  message?: string;
}

/**
 * Is this document number usable by this user?
 *
 * The same user resubmitting their own number is fine — a rejection followed by
 * a retry is normal and already happens in the live data. Only a number that
 * belongs to a DIFFERENT account is a duplicate.
 *
 * Records a fraud event against both accounts on a hit, so the pattern is
 * visible in admin review rather than only being blocked silently.
 */
export async function checkDocumentNumber(
  userId: string,
  raw: string | null | undefined,
  opts: { required?: boolean } = {}
): Promise<DocumentNumberCheck> {
  const normalized = normalizeDocumentNumber(raw);

  if (!normalized) {
    if (!opts.required) return { ok: true, normalized: "" };
    return {
      ok: false,
      normalized: "",
      reason: "EMPTY",
      message: "Enter the number printed on your document.",
    };
  }

  if (!isPlausibleDocumentNumber(normalized)) {
    return {
      ok: false,
      normalized,
      reason: "IMPLAUSIBLE",
      message: "That doesn't look like a valid document number.",
    };
  }

  // Anyone else already verified on this number?
  const owner = await prisma.user
    .findFirst({
      where: { nidNumber: normalized, id: { not: userId } },
      select: { id: true },
    })
    .catch(() => null);

  if (owner) {
    await recordFraudEvent({
      userId,
      eventType: "KYC_DUPLICATE_DOCUMENT",
      severity: "HIGH",
      details: { documentNumber: normalized, conflictUserId: owner.id },
    });
    await recordFraudEvent({
      userId: owner.id,
      eventType: "KYC_DUPLICATE_DOCUMENT",
      severity: "HIGH",
      details: { documentNumber: normalized, attemptedByUserId: userId },
    });
    return {
      ok: false,
      normalized,
      conflictUserId: owner.id,
      reason: "DUPLICATE",
      message:
        "This document is already verified on another account. Each ID can only be used once.",
    };
  }

  return { ok: true, normalized };
}

/**
 * Claim the number for this user at approval time.
 *
 * Separate from the check because the check runs at submission and this runs
 * when the document is actually accepted — only a verified document should own
 * the number. Safe to call repeatedly for the same user.
 *
 * Returns false if the unique index rejected it, which means another account
 * claimed the same number between the check and here. The caller should not
 * approve in that case.
 */
export async function claimDocumentNumber(
  userId: string,
  normalized: string
): Promise<boolean> {
  if (!normalized) return true;
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { nidNumber: normalized },
    });
    return true;
  } catch {
    // Unique violation — someone else holds it.
    return false;
  }
}
