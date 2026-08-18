/**
 * Client helper to upload a file as the current user (works for any authed user,
 * unlike `/api/media/upload` which is admin-only). Small files (≤5 MB) go direct
 * through `/api/upload` (PUT); larger files use a pre-signed S3 upload so big
 * stock videos / lossless audio don't hit the direct-upload cap. Returns the
 * public URL of the stored object.
 */
import { compressForUpload } from "@/lib/image-compress";

const DIRECT_MAX = 5 * 1024 * 1024;

export async function uploadUserFile(
  file: File,
  folder = "marketplace"
): Promise<string> {
  // Shrink raster images before upload (no-op for video/audio/gif/svg).
  file = await compressForUpload(file, folder);
  if (file.size <= DIRECT_MAX) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("folder", folder);
    const res = await fetch("/api/upload", { method: "PUT", body: fd });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.url) {
      throw new Error(d.error ?? `Upload failed (${res.status})`);
    }
    return d.url as string;
  }

  // Large file → pre-signed direct-to-S3 PUT.
  const init = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      folder,
    }),
  });
  const d = await init.json().catch(() => ({}));
  if (!init.ok || !d.uploadUrl || !d.publicUrl) {
    throw new Error(d.error ?? `Upload init failed (${init.status})`);
  }
  const put = await fetch(d.uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!put.ok) throw new Error(`Storage upload failed (${put.status})`);
  return d.publicUrl as string;
}
