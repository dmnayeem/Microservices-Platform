import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isS3Configured, getUploadUrl, generateFileKey, uploadFile, getPublicUrl } from "@/lib/s3";

// Maximum file size for direct upload (5MB)
const MAX_DIRECT_UPLOAD_SIZE = 5 * 1024 * 1024;

// Allowed file types
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/tiff"];
const ALLOWED_DOCUMENT_TYPES = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip", "application/epub+zip", "application/x-mobipocket-ebook"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
// Stock-media (music) deliverables.
const ALLOWED_AUDIO_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/flac", "audio/aac", "audio/ogg", "audio/aiff", "audio/x-aiff"];

// POST /api/upload - Request a pre-signed URL for file upload
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
    const { fileName, fileType, fileSize: _fileSize, folder = "uploads" } = body;

    if (!fileName || !fileType) {
      return NextResponse.json(
        { error: "File name and type are required" },
        { status: 400 }
      );
    }

    // Validate file type based on folder/purpose
    const allAllowedTypes = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_AUDIO_TYPES];
    if (!allAllowedTypes.includes(fileType)) {
      return NextResponse.json(
        { error: "File type not allowed" },
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

    // Generate file key
    const key = generateFileKey(folder, fileName, session.user.id);

    // Get pre-signed upload URL
    const result = await getUploadUrl(key, fileType);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to generate upload URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      uploadUrl: result.uploadUrl,
      key: result.key,
      publicUrl: getPublicUrl(key),
    });
  } catch (error) {
    console.error("Error generating upload URL:", error);
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 }
    );
  }
}

// PUT /api/upload - Direct upload for small files (from server)
export async function PUT(request: NextRequest) {
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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) || "uploads";

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Check file size for direct upload
    if (file.size > MAX_DIRECT_UPLOAD_SIZE) {
      return NextResponse.json(
        { error: "File too large. Use multipart upload for files over 5MB." },
        { status: 400 }
      );
    }

    // Validate file type
    const allAllowedTypes = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_AUDIO_TYPES];
    if (!allAllowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "File type not allowed" },
        { status: 400 }
      );
    }

    // Generate file key
    const key = generateFileKey(folder, file.name, session.user.id);

    // Read file content
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to S3
    const result = await uploadFile(key, buffer, file.type);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to upload file" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      url: result.url,
      key,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
