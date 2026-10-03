import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isS3Configured, getUploadUrl, generateFileKey, uploadFile, getPublicUrl } from "@/lib/s3";
import {
  USER_UPLOAD_TYPES,
  inspectUpload,
  decideUpload,
  decideUploadName,
  scanStoredUploadInBackground,
} from "@/lib/upload-safety";
import { resolvePurpose } from "@/lib/image-policy";
import { enforceDisplayImage } from "@/lib/image-compress-server";

// Maximum file size for direct upload (5MB)
const MAX_DIRECT_UPLOAD_SIZE = 5 * 1024 * 1024;

// Allowed file types (image / document / video / audio) — the list lives in
// src/lib/upload-safety.ts. The declared type is only the first gate: the
// bytes are sniffed (PUT) or the name is checked (pre-signed POST, where the
// server never sees the bytes), so a program renamed .pdf/.zip/.jpg is refused.

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
    if (!USER_UPLOAD_TYPES.includes(fileType)) {
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

    // Pre-signed: the bytes go straight to S3, so only the name/type can be
    // checked here (x.pdf.exe, .js, a ".zip" sent as image/png…). Marketplace
    // files are re-inspected byte-for-byte when the listing is submitted.
    const nameGate = await decideUploadName(String(fileName), String(fileType), {
      userId: session.user.id,
      where: `api/upload (pre-signed, ${folder})`,
    });
    if (nameGate.reject) {
      return NextResponse.json({ error: nameGate.reject }, { status: 400 });
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
    if (!USER_UPLOAD_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "File type not allowed" },
        { status: 400 }
      );
    }

    // Read file content
    const buffer = Buffer.from(await file.arrayBuffer());

    // Key for the safety log; replaced below if the image is re-encoded.
    let key = generateFileKey(folder, file.name, session.user.id);

    // What is it REALLY? A program/script/web page, or bytes that don't match
    // the name/type, is refused. Archive findings follow the admin's policy
    // (default: accept + flag to the Abuse Center).
    const verdict = inspectUpload(file.name, file.type, buffer);
    const gate = await decideUpload(verdict, {
      userId: session.user.id,
      where: `api/upload (${folder})`,
      fileName: file.name,
      key,
    });
    if (gate.reject) {
      return NextResponse.json({ error: gate.reject }, { status: 400 });
    }

    // Display images → ≤ 100 KB WebP (src/lib/image-policy.ts). Marketplace
    // deliverables and documents ("original" purposes) pass through untouched.
    const stored = await enforceDisplayImage(
      buffer,
      file.type,
      file.name,
      resolvePurpose(formData.get("purpose"), folder)
    );
    if (stored.changed) key = generateFileKey(folder, stored.fileName, session.user.id);

    // Upload to S3
    const result = await uploadFile(key, stored.buffer, stored.mime);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to upload file" },
        { status: 500 }
      );
    }

    // Optional malware lookup (VirusTotal hash / ClamAV) — documents and
    // archives only, after the response, never blocking the user.
    scanStoredUploadInBackground(buffer, verdict, {
      userId: session.user.id,
      where: `api/upload (${folder})`,
      fileName: file.name,
      key,
    });

    return NextResponse.json({
      success: true,
      url: result.url,
      key,
      fileName: stored.fileName,
      fileType: stored.mime,
      fileSize: stored.buffer.length,
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
