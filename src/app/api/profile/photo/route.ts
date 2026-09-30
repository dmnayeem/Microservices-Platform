import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  uploadFile,
  isS3Configured,
  getMediaUrl,
  generateMediaFilename,
  getMediaS3KeyPath,
  validateMediaFile,
} from "@/lib/s3";
import { inspectUpload, decideUpload } from "@/lib/upload-safety";

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

// POST /api/profile/photo
// FormData: { file: File, target: "avatar" | "coverPhoto" }
// Auth: any logged-in user (uploads their OWN profile media)
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isS3Configured()) {
      return NextResponse.json(
        { error: "Image upload is not configured on this server" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const target = formData.get("target");

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (target !== "avatar" && target !== "coverPhoto") {
      return NextResponse.json(
        { error: "target must be 'avatar' or 'coverPhoto'" },
        { status: 400 }
      );
    }

    const validation = validateMediaFile(
      file.type,
      file.size,
      ALLOWED_IMAGE_TYPES,
      MAX_BYTES
    );
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // The declared type said "image" — make sure the bytes agree.
    const gate = await decideUpload(inspectUpload(file.name, file.type, buffer), {
      userId: session.user.id,
      where: `profile/photo (${target})`,
      fileName: file.name,
    });
    if (gate.reject) {
      return NextResponse.json({ error: gate.reject }, { status: 400 });
    }

    const uniqueFilename = generateMediaFilename(file.name);
    const s3Key = getMediaS3KeyPath(file.type, uniqueFilename);

    const uploadResult = await uploadFile(s3Key, buffer, file.type, {
      originalFilename: file.name,
      uploadedBy: session.user.id,
      profileTarget: target,
    });

    if (!uploadResult.success || !uploadResult.url) {
      return NextResponse.json(
        { error: uploadResult.error || "Upload failed" },
        { status: 500 }
      );
    }

    const { s3Url, cloudFrontUrl } = getMediaUrl(s3Key);
    const url = cloudFrontUrl || s3Url;

    // Persist to user record
    const data =
      target === "avatar" ? { avatar: url } : { coverPhoto: url };
    await prisma.user.update({
      where: { id: session.user.id },
      data,
    });

    return NextResponse.json({ success: true, url, target });
  } catch (error) {
    console.error("Profile photo upload failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
