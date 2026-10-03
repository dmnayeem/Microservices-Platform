import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { uploadFile, isS3Configured, getMediaUrl, getMediaFileType, generateMediaFilename, getMediaS3KeyPath, validateMediaFile } from "@/lib/s3";
import { inspectUpload, decideUpload } from "@/lib/upload-safety";
import { resolvePurpose } from "@/lib/image-policy";
import { enforceDisplayImage } from "@/lib/image-compress-server";

// POST /api/media/upload - Upload media file (for small files < 1MB)
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminRole = session.user.role as UserRole | undefined;
    if (!hasPermission(adminRole, "tasks.create")) {
      // Using tasks.create as proxy for super_admin/admin check
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    if (!isS3Configured()) {
      return NextResponse.json({ error: "S3 not configured" }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file
    const validation = validateMediaFile(file.type, file.size);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Admin library: any type, but never a program, script or web page (it is
    // served from our own origin). Plain SVG logos stay allowed.
    const gate = await decideUpload(
      inspectUpload(file.name, file.type, buffer, { allowSvg: true }),
      { userId: session.user.id, where: "api/media/upload (admin media library)", fileName: file.name }
    );
    if (gate.reject) {
      return NextResponse.json({ error: gate.reject }, { status: 400 });
    }

    // Display images → ≤ 100 KB WebP (src/lib/image-policy.ts). Callers send
    // `purpose` (or a `folder` that implies one); "document" (attachments,
    // assignment/tutor files) and "deliverable" are stored byte-for-byte.
    // Default: library media image.
    const stored = await enforceDisplayImage(
      buffer,
      file.type,
      file.name,
      resolvePurpose(
        formData.get("purpose"),
        // tutor-applications / assignment-submissions → document (original)
        typeof formData.get("folder") === "string" ? (formData.get("folder") as string) : "media"
      )
    );

    // Generate unique filename and S3 key
    const uniqueFilename = generateMediaFilename(stored.fileName);
    const s3Key = getMediaS3KeyPath(stored.mime, uniqueFilename);

    // Upload to S3
    const uploadResult = await uploadFile(s3Key, stored.buffer, stored.mime, {
      originalFilename: file.name,
      uploadedBy: session.user.id,
    });

    if (!uploadResult.success || !uploadResult.url) {
      return NextResponse.json({ error: uploadResult.error || "Upload failed" }, { status: 500 });
    }

    // Get URLs
    const { s3Url, cloudFrontUrl } = getMediaUrl(s3Key);

    // Get file type
    const fileType = getMediaFileType(stored.mime);

    // Save to database
    const mediaItem = await prisma.media.create({
      data: {
        filename: uniqueFilename,
        originalFilename: file.name,
        fileType,
        mimeType: stored.mime,
        fileSize: stored.buffer.length,
        s3Key,
        s3Url,
        cloudFrontUrl,
        uploadedById: session.user.id,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      url: cloudFrontUrl || s3Url,
      s3Url,
      cloudFrontUrl,
      s3Key,
      filename: uniqueFilename,
      fileType: stored.mime,
      fileSize: stored.buffer.length,
      mediaItem,
    });
  } catch (error) {
    console.error("Error uploading media:", error);
    return NextResponse.json(
      { error: "Failed to upload media" },
      { status: 500 }
    );
  }
}
