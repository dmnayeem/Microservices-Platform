import { NextRequest, NextResponse } from "next/server";
import { financeGuard } from "@/lib/company-finance/api";
import { generateFileKey, getDownloadUrl, uploadFile, isS3Configured } from "@/lib/s3";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Receipts, bills and invoices attached to entries.
 *
 * Deliberately NOT the shared media library. That library is browsable by
 * anyone with `media.view` — content admins, marketing admins — so a receipt
 * uploaded there would put the landlord's bank details and the server bill in
 * front of exactly the people the owner said must not see finance.
 *
 * So receipts live under `finance-receipts/`, a prefix the public media proxy
 * (`/api/media/[...key]`, which serves only `media/`, `task-proofs/` and
 * `posts/`) will never hand out. The only way to read one is GET here, which
 * requires `finance.view` and answers with a presigned link that expires in
 * five minutes. What an entry stores is the KEY, never a public URL.
 */

const RECEIPT_PREFIX = "finance-receipts/";
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

export async function POST(request: NextRequest) {
  const g = await financeGuard("finance.entries.create");
  if ("res" in g) return g.res;
  if (!isS3Configured()) {
    return NextResponse.json({ error: "File storage is not configured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send the file as form data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Pick a file" }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "That file is empty" }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "A receipt can be at most 15 MB" }, { status: 400 });
  }
  const type = file.type || "application/octet-stream";
  if (!ALLOWED.has(type)) {
    return NextResponse.json(
      { error: "Receipts can be a PDF, a photo (JPG, PNG, WebP, HEIC) or a spreadsheet" },
      { status: 400 }
    );
  }

  const key = generateFileKey("finance-receipts", file.name || "receipt", g.caller.id);
  const up = await uploadFile(key, Buffer.from(await file.arrayBuffer()), type);
  if (!up.success) return NextResponse.json({ error: up.error ?? "Upload failed" }, { status: 502 });

  return NextResponse.json({ ok: true, key, name: file.name, size: file.size, type });
}

/** `?key=finance-receipts/...` → a short-lived link to the file. */
export async function GET(request: NextRequest) {
  const g = await financeGuard("finance.view");
  if ("res" in g) return g.res;
  const key = request.nextUrl.searchParams.get("key") ?? "";
  // Only this prefix, and no traversal — this route must never become a way to
  // presign a marketplace deliverable or a KYC document.
  if (!key.startsWith(RECEIPT_PREFIX) || key.includes("..")) {
    return NextResponse.json({ error: "Not a receipt" }, { status: 400 });
  }
  const link = await getDownloadUrl(key, 300);
  if (!link.success || !link.downloadUrl) {
    return NextResponse.json({ error: link.error ?? "Could not open that file" }, { status: 502 });
  }
  return NextResponse.redirect(link.downloadUrl);
}
