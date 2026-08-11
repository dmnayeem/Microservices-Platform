import { extractIdData, type ExtractedId } from "@/lib/gemini";
import { getSetting } from "@/lib/system-settings";
import { fetchImage } from "@/lib/kyc/image-bytes";
import { compareFaces } from "@/lib/kyc/face-match";

export interface AutoKycInput {
  user: {
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    dateOfBirth?: Date | null;
  };
  idImageUrls: string[]; // front (+ optional back)
  selfieUrl: string;
}

export interface AutoKycResult {
  // REJECT is only used when OCR positively determines the image is NOT an ID —
  // real-but-imperfect IDs still go to REVIEW (never a false hard-reject).
  decision: "APPROVED" | "REVIEW" | "REJECT";
  reasons: string[];
  extracted: ExtractedId & {
    faceSimilarity?: number;
    faceMatched?: boolean;
    ocrConfidence?: number;
  };
}

/** Normalize a name for comparison: lowercase, strip punctuation, collapse spaces. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True if the two names plausibly match (token subset either direction). */
function nameMatches(profile: string, ocr: string): boolean {
  const a = new Set(norm(profile).split(" ").filter((t) => t.length > 1));
  const b = new Set(norm(ocr).split(" ").filter((t) => t.length > 1));
  if (a.size === 0 || b.size === 0) return false;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let hit = 0;
  for (const t of small) if (big.has(t)) hit++;
  // Require most tokens of the shorter name to appear in the longer.
  return hit >= Math.max(2, Math.ceil(small.size * 0.75)) || (small.size === 1 && hit === 1);
}

/**
 * Run the automated KYC decision. Only returns APPROVED for high-confidence
 * passes; everything else is REVIEW (never auto-reject) so a bad read routes to
 * the existing manual admin queue instead of blocking a genuine user.
 */
export async function runAutoKyc(input: AutoKycInput): Promise<AutoKycResult> {
  const [faceMin, ocrMin, ocrRejectBelow] = await Promise.all([
    getSetting<number>("kyc.faceMinSimilarity", 88),
    getSetting<number>("kyc.ocrMinConfidence", 0.7),
    getSetting<number>("kyc.ocrRejectBelow", 0.2),
  ]);

  const reasons: string[] = [];
  const extracted: AutoKycResult["extracted"] = { confidence: 0 };

  // 1) Load images.
  let idImgs: { base64: string; mime: string }[] = [];
  let selfieBytes: Uint8Array | null = null;
  let idFrontBytes: Uint8Array | null = null;
  try {
    const loaded = await Promise.all(input.idImageUrls.slice(0, 2).map(fetchImage));
    idImgs = loaded.map((l) => ({ base64: l.base64, mime: l.mime }));
    idFrontBytes = loaded[0]?.bytes ?? null;
    selfieBytes = (await fetchImage(input.selfieUrl)).bytes;
  } catch {
    return { decision: "REVIEW", reasons: ["Couldn't read the uploaded images."], extracted };
  }

  // 2) OCR the ID.
  const ocr = await extractIdData(idImgs);
  if (!ocr.success || !ocr.data) {
    // OCR couldn't run (e.g. Gemini not configured / transient error). We can't
    // tell whether it's a real ID → route to manual review, never hard-reject.
    reasons.push("Couldn't read the ID document clearly.");
  } else {
    Object.assign(extracted, ocr.data);
    extracted.ocrConfidence = ocr.data.confidence;
    // Hard reject only on a POSITIVE "this isn't an ID" signal from a successful
    // read: the model flagged it as not an ID, or confidence is floor-low. This
    // is what surfaces a clear error when someone uploads a non-ID / random photo.
    if (ocr.data.isIdDocument === false || ocr.data.confidence < ocrRejectBelow) {
      return {
        decision: "REJECT",
        reasons: [
          "The uploaded image doesn't look like a valid government ID. Please upload a clear photo of your ID.",
        ],
        extracted,
      };
    }
    if (ocr.data.confidence < ocrMin) reasons.push("ID image wasn't clear enough.");
  }

  // 3) Face match selfie ↔ ID.
  if (selfieBytes && idFrontBytes) {
    const fm = await compareFaces(selfieBytes, idFrontBytes, Math.min(faceMin, 80));
    extracted.faceSimilarity = fm.ok ? Math.round(fm.similarity) : undefined;
    extracted.faceMatched = fm.ok ? fm.similarity >= faceMin : undefined;
    if (!fm.ok) reasons.push("Face check couldn't run.");
    else {
      if (fm.faces !== 1) reasons.push("Selfie should show exactly one clear face.");
      if (fm.similarity < faceMin) reasons.push("Selfie didn't clearly match the ID photo.");
    }
  } else {
    reasons.push("Selfie or ID image missing.");
  }

  // 4) Name check against the profile. Prefer the card's English name (a BD NID
  // prints one) so a Bangla-script name doesn't force a mismatch. Only assert a
  // mismatch when BOTH names have comparable Latin tokens — if either normalizes
  // to empty (different scripts), we can't compare, so skip rather than false-flag.
  const profileName =
    input.user.name?.trim() ||
    [input.user.firstName, input.user.lastName].filter(Boolean).join(" ").trim();
  const ocrName = extracted.fullNameEnglish || extracted.fullName;
  if (ocrName && profileName) {
    const comparable = norm(profileName).length > 0 && norm(ocrName).length > 0;
    if (comparable && !nameMatches(profileName, ocrName)) {
      reasons.push("Name on the ID didn't match your profile name.");
    }
  } else if (!extracted.fullName) {
    reasons.push("Couldn't read the name on the ID.");
  }

  // 5) DOB check (only when the profile already has a DOB).
  if (input.user.dateOfBirth && extracted.dateOfBirth) {
    const profileDob = input.user.dateOfBirth.toISOString().slice(0, 10);
    if (profileDob !== extracted.dateOfBirth) {
      reasons.push("Date of birth didn't match your profile.");
    }
  }

  // 6) Expiry check.
  if (extracted.expiry) {
    const exp = new Date(extracted.expiry);
    if (!Number.isNaN(exp.getTime()) && exp.getTime() < Date.now()) {
      reasons.push("The ID appears to be expired.");
    }
  }

  const decision: AutoKycResult["decision"] = reasons.length === 0 ? "APPROVED" : "REVIEW";
  return { decision, reasons, extracted };
}
