/**
 * S3 Multipart Upload Utility
 *
 * This module provides client-side multipart upload functionality using S3's multipart upload.
 * It works in serverless environments (including Vercel) and handles files of any size.
 *
 * For files < 1MB: Uses direct upload (single request)
 * For files >= 1MB: Uses S3 multipart with presigned URLs for direct browser-to-S3 uploads
 *
 * The multipart upload flow:
 * 1. Browser calls /initiate to get uploadId and presigned URLs for all parts
 * 2. Browser uploads each part directly to S3 using presigned URL
 * 3. Browser reads ETag from S3 response (requires S3 CORS ExposeHeaders: ["ETag"])
 * 4. Browser calls /complete with all ETags to finalize the upload
 *
 * This approach bypasses Vercel's 4.5MB body size limit for serverless functions.
 */

import type { UploadConfig, UploadResult, UploadOptions } from "@/types/media";
import { compressForPurpose } from "@/lib/image-compress";
import type { ImagePurpose } from "@/lib/image-policy";

// S3 multipart minimum part size (5MB minimum, except last part)
export const S3_PART_SIZE = 5 * 1024 * 1024;

// Threshold for multipart upload (4MB).
// Files at-or-under this go through the server-side direct-upload route
// (/api/media/upload) which streams to S3 server-side and isn't subject to
// bucket CORS. Vercel serverless body limit is 4.5MB, so 4MB is a safe ceiling.
// Files above this require S3 bucket CORS to expose the ETag header — see
// docs/s3-setup.md.
export const MULTIPART_THRESHOLD = 4 * 1024 * 1024;

/**
 * Upload a file using S3 multipart upload
 * Automatically chooses between regular upload (< 1MB) and multipart upload (>= 1MB)
 */
export async function uploadFileWithMultipart(
  file: File | Blob,
  filename: string,
  config: UploadConfig,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const { onProgress, extraFields } = options;

  try {
    // For small files, use direct upload
    if (file.size < MULTIPART_THRESHOLD) {
      return await uploadDirect(file, filename, config.regularEndpoint, onProgress, extraFields);
    }

    // For larger files, use S3 multipart upload with presigned URLs
    return await uploadMultipart(file, filename, config, onProgress);
  } catch (error) {
    console.error("Upload error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}

/**
 * Direct upload for small files (< 1MB)
 */
async function uploadDirect(
  file: File | Blob,
  filename: string,
  endpoint: string,
  onProgress?: (progress: number) => void,
  extraFields?: Record<string, string>
): Promise<UploadResult> {
  return new Promise((resolve) => {
    const formData = new FormData();
    formData.append("file", file, filename);

    // Add any extra fields
    if (extraFields) {
      Object.entries(extraFields).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        const progress = Math.round((e.loaded / e.total) * 100);
        onProgress(progress);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText);
          if (result.success) {
            resolve({
              success: true,
              url: result.url || result.cloudFrontUrl || result.s3Url,
              s3Key: result.s3Key,
              filename: result.filename,
              fileType: result.fileType,
              fileSize: result.fileSize,
              mediaItem: result.mediaItem,
            });
          } else {
            resolve({ success: false, error: result.error || "Upload failed" });
          }
        } catch {
          resolve({ success: false, error: "Invalid response from server" });
        }
      } else {
        // Try to surface the server's error message (e.g. "Forbidden — Admin access required")
        let serverMessage = xhr.statusText || `HTTP ${xhr.status}`;
        try {
          const body = JSON.parse(xhr.responseText);
          if (body?.error) serverMessage = body.error;
        } catch {
          if (xhr.responseText) serverMessage = xhr.responseText.slice(0, 200);
        }
        resolve({ success: false, error: `${serverMessage} (HTTP ${xhr.status})` });
      }
    };

    xhr.onerror = () => {
      resolve({
        success: false,
        error:
          "Network error during upload. Check your connection and that you're signed in.",
      });
    };

    xhr.open("POST", endpoint);
    xhr.send(formData);
  });
}

/**
 * S3 Multipart upload for large files (>= 1MB)
 * Uses presigned URLs for direct S3 upload, reads ETag from response
 * This bypasses Vercel's 4.5MB serverless function body size limit
 * Requires S3 CORS config with ExposeHeaders: ["ETag"]
 */
async function uploadMultipart(
  file: File | Blob,
  filename: string,
  config: UploadConfig,
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  // Step 1: Initiate multipart upload (also returns presigned URLs for all parts)
  const initiateResponse = await fetch(config.initiateEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename,
      fileType: file.type || "application/octet-stream",
      fileSize: file.size,
      partSize: S3_PART_SIZE,
    }),
  });

  if (!initiateResponse.ok) {
    const error = await initiateResponse.json().catch(() => ({ error: "Failed to initiate upload" }));
    throw new Error(error.error || "Failed to initiate upload");
  }

  const initData = await initiateResponse.json();

  if (!initData.success) {
    throw new Error(initData.error || "Failed to initiate upload");
  }

  const {
    uploadId: s3UploadId,
    s3Key,
    totalParts,
    partSize,
    filename: serverFilename,
    originalFilename,
    fileType,
    type,
    urls, // Presigned URLs for each part
  } = initData;

  const completedParts: { PartNumber: number; ETag: string }[] = [];

  try {
    // Step 2: Upload parts directly to S3 using presigned URLs
    for (let i = 0; i < totalParts; i++) {
      const partNumber = i + 1;
      const start = i * partSize;
      const end = Math.min(start + partSize, file.size);
      const partData = file.slice(start, end);

      // Get the presigned URL for this part
      const urlInfo = urls?.find((u: { partNumber: number; signedUrl: string }) => u.partNumber === partNumber);
      if (!urlInfo || !urlInfo.signedUrl) {
        throw new Error(`No presigned URL for part ${partNumber}`);
      }

      // Upload directly to S3 using presigned URL
      const s3Response = await fetch(urlInfo.signedUrl, {
        method: "PUT",
        body: partData,
      });

      if (!s3Response.ok) {
        throw new Error(`Failed to upload part ${partNumber} to S3: ${s3Response.status}`);
      }

      // Get ETag directly from S3 response (requires CORS ExposeHeaders: ["ETag"])
      const etag = s3Response.headers.get("ETag");
      if (!etag) {
        throw new Error(`No ETag returned for part ${partNumber}. Check S3 CORS ExposeHeaders config.`);
      }

      completedParts.push({
        PartNumber: partNumber,
        ETag: etag.replace(/"/g, ""), // Remove quotes from ETag
      });

      // Update progress (90% for parts, 10% for completion)
      if (onProgress) {
        const progress = Math.round(((i + 1) / totalParts) * 90);
        onProgress(progress);
      }
    }

    // Step 3: Complete the multipart upload
    const completeResponse = await fetch(config.completeEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uploadId: s3UploadId,
        s3Key,
        parts: completedParts,
        filename: serverFilename,
        originalFilename,
        fileType,
        type,
        fileSize: file.size,
      }),
    });

    if (!completeResponse.ok) {
      const error = await completeResponse.json().catch(() => ({ error: "Failed to complete upload" }));
      throw new Error(error.error || "Failed to complete upload");
    }

    const result = await completeResponse.json();

    if (!result.success) {
      throw new Error(result.error || "Failed to complete upload");
    }

    if (onProgress) {
      onProgress(100);
    }

    return {
      success: true,
      url: result.url || result.cloudFrontUrl || result.s3Url,
      s3Key: result.s3Key || s3Key,
      filename: result.filename || serverFilename,
      fileType: result.fileType || fileType,
      fileSize: file.size,
      mediaItem: result.mediaItem,
    };
  } catch (error) {
    // Abort the multipart upload on failure
    try {
      await fetch(config.completeEndpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId: s3UploadId, s3Key }),
      });
    } catch (abortError) {
      console.warn("Failed to abort multipart upload:", abortError);
    }
    throw error;
  }
}

/**
 * Pre-configured upload config for Media Library
 */
export const mediaUploadConfig: UploadConfig = {
  regularEndpoint: "/api/media/upload",
  initiateEndpoint: "/api/media/upload/multipart/initiate",
  completeEndpoint: "/api/media/upload/multipart/complete",
};

/**
 * Upload media file to Media Library
 */
export async function uploadMediaFile(
  file: File,
  options: UploadOptions = {},
  purpose: ImagePurpose = "media"
): Promise<UploadResult> {
  // Display images → ≤ 100 KB WebP before upload (src/lib/image-policy.ts), so
  // they always take the direct route, where the server re-checks them.
  const out = await compressForPurpose(file, purpose);
  return uploadFileWithMultipart(out, out.name, mediaUploadConfig, {
    ...options,
    extraFields: { ...options.extraFields, purpose },
  });
}
