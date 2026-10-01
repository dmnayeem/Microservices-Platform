import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  isS3Configured,
  generateFileKey,
  initializeMultipartUpload,
  getMultipartUploadUrls,
  completeMultipartUpload,
  abortMultipartUpload,
  listUploadedParts,
  getPublicUrl,
} from "@/lib/s3";
import { USER_UPLOAD_TYPES, decideUploadName } from "@/lib/upload-safety";

// Minimum part size (5MB except for last part)
const MIN_PART_SIZE = 5 * 1024 * 1024;

// POST /api/upload/multipart - Initialize multipart upload
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isS3Configured()) {
      return NextResponse.json(
        { error: "File upload service is not available" },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { action, fileName, fileType, fileSize, folder = "uploads", uploadId, key, parts, partNumbers } = body;

    switch (action) {
      case "init": {
        // Initialize a new multipart upload
        if (!fileName || !fileType || !fileSize) {
          return NextResponse.json(
            { error: "File name, type, and size are required" },
            { status: 400 }
          );
        }

        // Validate folder
        const allowedFolders = [
          "avatars",
          "kyc",
          "task-proofs",
          "marketplace",
          "posts",
          "courses",
          "disputes",
          "uploads",
        ];
        if (!allowedFolders.includes(folder)) {
          return NextResponse.json(
            { error: "Invalid upload folder" },
            { status: 400 }
          );
        }

        // Same type allowlist and name rules as /api/upload — this route used
        // to accept ANY type (it has no callers in the app today).
        if (!USER_UPLOAD_TYPES.includes(fileType)) {
          return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
        }
        const nameGate = await decideUploadName(String(fileName), String(fileType), {
          userId: session.user.id,
          where: `api/upload/multipart (${folder})`,
        });
        if (nameGate.reject) {
          return NextResponse.json({ error: nameGate.reject }, { status: 400 });
        }

        // Generate file key
        const fileKey = generateFileKey(folder, fileName, session.user.id);

        // Initialize multipart upload
        const result = await initializeMultipartUpload(fileKey, fileType, {
          originalName: fileName,
          uploadedBy: session.user.id,
        });

        if (!result.success) {
          return NextResponse.json(
            { error: result.error || "Failed to initialize upload" },
            { status: 500 }
          );
        }

        // Calculate number of parts
        const numParts = Math.ceil(fileSize / MIN_PART_SIZE);
        const partNumbersArray = Array.from({ length: numParts }, (_, i) => i + 1);

        // Get pre-signed URLs for all parts
        const urlsResult = await getMultipartUploadUrls(
          fileKey,
          result.uploadId!,
          partNumbersArray
        );

        if (!urlsResult.success) {
          return NextResponse.json(
            { error: urlsResult.error || "Failed to get upload URLs" },
            { status: 500 }
          );
        }

        return NextResponse.json({
          uploadId: result.uploadId,
          key: fileKey,
          partSize: MIN_PART_SIZE,
          totalParts: numParts,
          urls: urlsResult.urls,
          publicUrl: getPublicUrl(fileKey),
        });
      }

      case "getUrls": {
        // Get pre-signed URLs for specific parts (for retry)
        if (!uploadId || !key || !partNumbers) {
          return NextResponse.json(
            { error: "Upload ID, key, and part numbers are required" },
            { status: 400 }
          );
        }

        const urlsResult = await getMultipartUploadUrls(key, uploadId, partNumbers);

        if (!urlsResult.success) {
          return NextResponse.json(
            { error: urlsResult.error || "Failed to get upload URLs" },
            { status: 500 }
          );
        }

        return NextResponse.json({
          urls: urlsResult.urls,
        });
      }

      case "complete": {
        // Complete the multipart upload
        if (!uploadId || !key || !parts) {
          return NextResponse.json(
            { error: "Upload ID, key, and parts are required" },
            { status: 400 }
          );
        }

        const result = await completeMultipartUpload(key, uploadId, parts);

        if (!result.success) {
          return NextResponse.json(
            { error: result.error || "Failed to complete upload" },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          url: result.url,
          key,
        });
      }

      case "abort": {
        // Abort the multipart upload
        if (!uploadId || !key) {
          return NextResponse.json(
            { error: "Upload ID and key are required" },
            { status: 400 }
          );
        }

        const result = await abortMultipartUpload(key, uploadId);

        if (!result.success) {
          return NextResponse.json(
            { error: result.error || "Failed to abort upload" },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          message: "Upload aborted",
        });
      }

      case "listParts": {
        // List uploaded parts
        if (!uploadId || !key) {
          return NextResponse.json(
            { error: "Upload ID and key are required" },
            { status: 400 }
          );
        }

        const result = await listUploadedParts(key, uploadId);

        if (!result.success) {
          return NextResponse.json(
            { error: result.error || "Failed to list parts" },
            { status: 500 }
          );
        }

        return NextResponse.json({
          parts: result.parts,
        });
      }

      default:
        return NextResponse.json(
          { error: "Invalid action" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Error handling multipart upload:", error);
    return NextResponse.json(
      { error: "Failed to process upload request" },
      { status: 500 }
    );
  }
}
