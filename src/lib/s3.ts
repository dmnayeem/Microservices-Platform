/**
 * AWS S3 File Upload Service
 *
 * This module provides integration with AWS S3 for file storage including
 * multipart uploads for large files.
 *
 * Required environment variables:
 * - AWS_ACCESS_KEY_ID: Your AWS access key
 * - AWS_SECRET_ACCESS_KEY: Your AWS secret key
 * - AWS_REGION: AWS region (e.g., us-east-1)
 * - AWS_S3_BUCKET: S3 bucket name
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET;
const AWS_CLOUDFRONT_DOMAIN = process.env.AWS_CLOUDFRONT_DOMAIN;

// Initialize S3 client
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_S3_BUCKET) {
      throw new Error("AWS S3 credentials not configured");
    }
    s3Client = new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

/**
 * Check if S3 is configured
 */
export function isS3Configured(): boolean {
  return !!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY && AWS_S3_BUCKET);
}

/**
 * Get the configured S3 bucket name
 */
export function getBucketName(): string {
  return AWS_S3_BUCKET || "";
}

/**
 * Generate a unique key for file storage
 */
export function generateFileKey(
  folder: string,
  fileName: string,
  userId?: string
): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
  const userPrefix = userId ? `${userId}/` : "";
  return `${folder}/${userPrefix}${timestamp}_${random}_${sanitizedFileName}`;
}

/**
 * Upload a file directly to S3
 */
export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string,
  metadata?: Record<string, string>
): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!isS3Configured()) {
    return { success: false, error: "S3 not configured" };
  }

  try {
    const client = getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: AWS_S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
      })
    );

    // Prefer the CloudFront delivery URL when configured — the bucket is served
    // via CloudFront (raw S3 URLs are not publicly loadable, causing broken images).
    const url = AWS_CLOUDFRONT_DOMAIN
      ? `https://${AWS_CLOUDFRONT_DOMAIN}/${key}`
      : `https://${AWS_S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`;
    return { success: true, url };
  } catch (error) {
    console.error("Error uploading to S3:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Get a pre-signed URL for direct upload from client
 */
export async function getUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<{ success: boolean; uploadUrl?: string; key?: string; error?: string }> {
  if (!isS3Configured()) {
    return { success: false, error: "S3 not configured" };
  }

  try {
    const client = getS3Client();
    const command = new PutObjectCommand({
      Bucket: AWS_S3_BUCKET,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn });
    return { success: true, uploadUrl, key };
  } catch (error) {
    console.error("Error getting upload URL:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Get a pre-signed URL for downloading a file
 */
export async function getDownloadUrl(
  key: string,
  expiresIn: number = 3600
): Promise<{ success: boolean; downloadUrl?: string; error?: string }> {
  if (!isS3Configured()) {
    return { success: false, error: "S3 not configured" };
  }

  try {
    const client = getS3Client();
    const command = new GetObjectCommand({
      Bucket: AWS_S3_BUCKET,
      Key: key,
    });

    const downloadUrl = await getSignedUrl(client, command, { expiresIn });
    return { success: true, downloadUrl };
  } catch (error) {
    console.error("Error getting download URL:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Delete a file from S3
 */
export async function deleteFile(
  key: string
): Promise<{ success: boolean; error?: string }> {
  if (!isS3Configured()) {
    return { success: false, error: "S3 not configured" };
  }

  try {
    const client = getS3Client();
    await client.send(
      new DeleteObjectCommand({
        Bucket: AWS_S3_BUCKET,
        Key: key,
      })
    );
    return { success: true };
  } catch (error) {
    console.error("Error deleting from S3:", error);
    return { success: false, error: String(error) };
  }
}

// ============ Multipart Upload Functions ============

/**
 * Initialize a multipart upload
 */
export async function initializeMultipartUpload(
  key: string,
  contentType: string,
  metadata?: Record<string, string>
): Promise<{
  success: boolean;
  uploadId?: string;
  key?: string;
  error?: string;
}> {
  if (!isS3Configured()) {
    return { success: false, error: "S3 not configured" };
  }

  try {
    const client = getS3Client();
    const response = await client.send(
      new CreateMultipartUploadCommand({
        Bucket: AWS_S3_BUCKET,
        Key: key,
        ContentType: contentType,
        Metadata: metadata,
      })
    );

    return {
      success: true,
      uploadId: response.UploadId,
      key,
    };
  } catch (error) {
    console.error("Error initializing multipart upload:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Get pre-signed URLs for uploading parts
 */
export async function getMultipartUploadUrls(
  key: string,
  uploadId: string,
  partNumbers: number[],
  expiresIn: number = 3600
): Promise<{
  success: boolean;
  urls?: Array<{ partNumber: number; url: string }>;
  error?: string;
}> {
  if (!isS3Configured()) {
    return { success: false, error: "S3 not configured" };
  }

  try {
    const client = getS3Client();
    const urls: Array<{ partNumber: number; url: string }> = [];

    for (const partNumber of partNumbers) {
      const command = new UploadPartCommand({
        Bucket: AWS_S3_BUCKET,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      });

      const url = await getSignedUrl(client, command, { expiresIn });
      urls.push({ partNumber, url });
    }

    return { success: true, urls };
  } catch (error) {
    console.error("Error getting multipart upload URLs:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Complete a multipart upload
 */
export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: Array<{ ETag: string; PartNumber: number }>
): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!isS3Configured()) {
    return { success: false, error: "S3 not configured" };
  }

  try {
    const client = getS3Client();

    // Sort parts by part number
    const sortedParts: CompletedPart[] = parts
      .sort((a, b) => a.PartNumber - b.PartNumber)
      .map((p) => ({
        ETag: p.ETag,
        PartNumber: p.PartNumber,
      }));

    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: AWS_S3_BUCKET,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: sortedParts },
      })
    );

    const url = `https://${AWS_S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`;
    return { success: true, url };
  } catch (error) {
    console.error("Error completing multipart upload:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Abort a multipart upload
 */
export async function abortMultipartUpload(
  key: string,
  uploadId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isS3Configured()) {
    return { success: false, error: "S3 not configured" };
  }

  try {
    const client = getS3Client();
    await client.send(
      new AbortMultipartUploadCommand({
        Bucket: AWS_S3_BUCKET,
        Key: key,
        UploadId: uploadId,
      })
    );
    return { success: true };
  } catch (error) {
    console.error("Error aborting multipart upload:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * List parts of an ongoing multipart upload
 */
export async function listUploadedParts(
  key: string,
  uploadId: string
): Promise<{
  success: boolean;
  parts?: Array<{ PartNumber: number; ETag: string; Size: number }>;
  error?: string;
}> {
  if (!isS3Configured()) {
    return { success: false, error: "S3 not configured" };
  }

  try {
    const client = getS3Client();
    const response = await client.send(
      new ListPartsCommand({
        Bucket: AWS_S3_BUCKET,
        Key: key,
        UploadId: uploadId,
      })
    );

    const parts = (response.Parts || []).map((p) => ({
      PartNumber: p.PartNumber || 0,
      ETag: p.ETag || "",
      Size: p.Size || 0,
    }));

    return { success: true, parts };
  } catch (error) {
    console.error("Error listing parts:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Get the public URL for a file
 */
export function getPublicUrl(key: string): string {
  return AWS_CLOUDFRONT_DOMAIN
    ? `https://${AWS_CLOUDFRONT_DOMAIN}/${key}`
    : `https://${AWS_S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`;
}

/**
 * Read an object straight from S3 using the server's IAM credentials, for
 * same-origin proxying. The public CloudFront/S3 URLs are NOT readable (the
 * bucket is private and CloudFront has no OAC), so avatars/media served by the
 * `/api/media` proxy stream through here instead of relying on the public URL.
 */
export async function getObjectStream(key: string): Promise<{
  body: import("@aws-sdk/client-s3").GetObjectCommandOutput["Body"];
  contentType: string;
  contentLength?: number;
}> {
  const client = getS3Client();
  const out = await client.send(
    new GetObjectCommand({ Bucket: AWS_S3_BUCKET, Key: key })
  );
  return {
    body: out.Body,
    contentType: out.ContentType ?? "application/octet-stream",
    contentLength: out.ContentLength,
  };
}

/**
 * Get CloudFront URL if configured, otherwise S3 URL
 */
export function getMediaUrl(s3Key: string): { s3Url: string; cloudFrontUrl?: string } {
  const s3Url = `https://${AWS_S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`;
  const cloudFrontDomain = process.env.AWS_CLOUDFRONT_DOMAIN;
  const cloudFrontUrl = cloudFrontDomain ? `https://${cloudFrontDomain}/${s3Key}` : undefined;

  return { s3Url, cloudFrontUrl };
}

/**
 * Determine media file type from MIME type
 */
export function getMediaFileType(mimeType: string): "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "OTHER" {
  if (mimeType.startsWith("image/")) return "IMAGE";
  if (mimeType.startsWith("video/")) return "VIDEO";
  if (mimeType.startsWith("audio/")) return "AUDIO";
  if (mimeType.includes("pdf") || mimeType.includes("document") || mimeType.includes("text")) return "DOCUMENT";
  return "OTHER";
}

/**
 * Get S3 key path based on file type for media library
 */
export function getMediaS3KeyPath(fileType: string, filename: string): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  let folder = "other";
  if (fileType.startsWith("image/")) folder = "images";
  else if (fileType.startsWith("video/")) folder = "videos";
  else if (fileType.startsWith("audio/")) folder = "audio";
  else if (fileType.includes("pdf") || fileType.includes("document")) folder = "documents";

  return `media/${folder}/${year}/${month}/${filename}`;
}

/**
 * Generate a unique filename with timestamp for media
 */
export function generateMediaFilename(originalFilename: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const ext = originalFilename.split(".").pop();
  const nameWithoutExt = originalFilename.replace(/\.[^/.]+$/, "");
  const sanitized = nameWithoutExt.replace(/[^a-zA-Z0-9-_]/g, "-");
  return `${sanitized}-${timestamp}-${random}.${ext}`;
}

/**
 * Validate media file
 */
export function validateMediaFile(
  mimeType: string,
  fileSize: number,
  allowedTypes?: string[],
  maxSizeBytes?: number
): { isValid: boolean; error?: string } {
  // Check file size (default 100MB)
  const maxSize = maxSizeBytes || 100 * 1024 * 1024;
  if (fileSize > maxSize) {
    return {
      isValid: false,
      error: `File size exceeds ${Math.round(maxSize / (1024 * 1024))}MB limit`,
    };
  }

  // Check file type if specified
  if (allowedTypes && allowedTypes.length > 0) {
    const isAllowed = allowedTypes.some((type) => {
      if (type.endsWith("/*")) {
        const prefix = type.replace("/*", "");
        return mimeType.startsWith(prefix);
      }
      return mimeType === type;
    });

    if (!isAllowed) {
      return {
        isValid: false,
        error: `File type ${mimeType} is not allowed`,
      };
    }
  }

  return { isValid: true };
}

// Multipart upload constants
export const S3_PART_SIZE = 5 * 1024 * 1024; // 5MB
export const MULTIPART_THRESHOLD = 1 * 1024 * 1024; // 1MB
