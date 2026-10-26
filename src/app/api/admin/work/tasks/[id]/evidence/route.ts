import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateFileKey, getDownloadUrl, isS3Configured, uploadFile } from "@/lib/s3";
import { decideUpload, inspectUpload } from "@/lib/upload-safety";
import { dbRateLimit } from "@/lib/rate-limit-db";
import { loadTaskFor } from "@/lib/work/access";
import { bad, notFound, workGuard } from "@/lib/work/server";

type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

/**
 * POST — upload one evidence file for a report on this task (people doing it
 * only). Stored privately under work-evidence/<taskId>/; the report then
 * references the returned key.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const g = await workGuard();
  if ("error" in g) return g.error;
  const a = g.actor;
  const { id } = await params;
  const found = await loadTaskFor(a, id);
  if (!found) return notFound();
  if (!found.caps.report) return bad("Only people doing this task can upload evidence.", 403);
  if (!isS3Configured()) return bad("File storage is not configured", 503);
  if (!(await dbRateLimit(`work-evidence:${a.userId}`, 30, 60 * 60_000)).ok) return bad("Too many uploads — try again later.", 429);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("Send the file as form data");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return bad("Pick a file");
  if (file.size > MAX_BYTES) return bad("A file can be at most 10 MB");
  const type = file.type || "application/octet-stream";
  if (!ALLOWED.has(type)) return bad("Evidence can be a photo (JPG, PNG, WebP, HEIC), a PDF, a Word or Excel file, or a CSV");

  const name = file.name || "evidence";
  const key = generateFileKey(`work-evidence/${id}`, name, a.userId);
  const bytes = Buffer.from(await file.arrayBuffer());
  const gate = await decideUpload(inspectUpload(name, type, bytes), { userId: a.userId, where: "team work evidence", fileName: name, key });
  if (gate.reject) return bad(gate.reject);
  const up = await uploadFile(key, bytes, type);
  if (!up.success) return bad(up.error ?? "Upload failed", 502);
  return NextResponse.json({ ok: true, key, name, size: file.size, type });
}

/**
 * GET ?key=… — a short-lived link to an evidence file, for anyone who may see
 * the task — and only for a file one of ITS reports actually references.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const g = await workGuard();
  if ("error" in g) return g.error;
  const { id } = await params;
  const found = await loadTaskFor(g.actor, id);
  if (!found) return notFound();
  const key = req.nextUrl.searchParams.get("key") ?? "";
  if (!key.startsWith(`work-evidence/${id}/`) || key.includes("..")) return notFound();
  const used = await prisma.workReport.count({
    where: { taskId: id, attachments: { array_contains: [{ key }] } },
  });
  if (!used) return notFound();
  const link = await getDownloadUrl(key, 300);
  if (!link.success || !link.downloadUrl) return bad(link.error ?? "Could not open that file", 502);
  return NextResponse.redirect(link.downloadUrl);
}
