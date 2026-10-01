import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission, type UserRole } from "@/lib/rbac";
import {
  initializeMultipartUpload,
  getMultipartUploadUrls,
  generateMediaFilename,
  getMediaS3KeyPath,
  validateMediaFile,
  isS3Configured,
  S3_PART_SIZE,
} from "@/lib/s3";
import { decideUploadName } from "@/lib/upload-safety";

// POST /api/media/upload/multipart/initiate - Initiate multipart upload
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminRole = session.user.role as UserRole | undefined;
    if (!hasPermission(adminRole, "tasks.create")) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    if (!isS3Configured()) {
      return NextResponse.json({ error: "S3 not configured" }, { status: 500 });
    }

    const body = await request.json();
    const { filename, fileType, fileSize, partSize } = body;

    if (!filename || !fileType || !fileSize) {
      return NextResponse.json(
        { error: "Missing required fields: filename, fileType, fileSize" },
        { status: 400 }
      );
    }

    // Validate file
    const validation = validateMediaFile(fileType, fileSize);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Name/type rules (the bytes never pass through this server).
    const nameGate = await decideUploadName(
      String(filename),
      String(fileType),
      { userId: session.user.id, where: "api/media/upload/multipart (admin media library)" },
      { allowSvg: true }
    );
    if (nameGate.reject) {
      return NextResponse.json({ error: nameGate.reject }, { status: 400 });
    }

    // Generate unique filename and S3 key
    const uniqueFilename = generateMediaFilename(filename);
    const s3Key = getMediaS3KeyPath(fileType, uniqueFilename);

    // Initialize multipart upload
    const initResult = await initializeMultipartUpload(s3Key, fileType, {
      originalFilename: filename,
      uploadedBy: session.user.id,
    });

    if (!initResult.success || !initResult.uploadId) {
      return NextResponse.json(
        { error: initResult.error || "Failed to initialize upload" },
        { status: 500 }
      );
    }

    // Calculate number of parts
    const actualPartSize = partSize || S3_PART_SIZE;
    const totalParts = Math.ceil(fileSize / actualPartSize);

    // Generate presigned URLs for all parts
    const partNumbers = Array.from({ length: totalParts }, (_, i) => i + 1);
    const urlsResult = await getMultipartUploadUrls(
      s3Key,
      initResult.uploadId,
      partNumbers,
      3600 // 1 hour expiry
    );

    if (!urlsResult.success || !urlsResult.urls) {
      return NextResponse.json(
        { error: urlsResult.error || "Failed to generate upload URLs" },
        { status: 500 }
      );
    }

    // Convert URL format for client
    const urls = urlsResult.urls.map((u) => ({
      partNumber: u.partNumber,
      signedUrl: u.url,
    }));

    return NextResponse.json({
      success: true,
      uploadId: initResult.uploadId,
      s3Key,
      totalParts,
      partSize: actualPartSize,
      filename: uniqueFilename,
      originalFilename: filename,
      fileType,
      type: fileType,
      urls,
    });
  } catch (error) {
    console.error("Error initiating multipart upload:", error);
    return NextResponse.json(
      { error: "Failed to initiate multipart upload" },
      { status: 500 }
    );
  }
}
