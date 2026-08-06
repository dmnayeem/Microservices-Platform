import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { generateImage } from "@/lib/gemini";
import {
  uploadFile,
  isS3Configured,
  getMediaUrl,
  getMediaFileType,
  generateMediaFilename,
  getMediaS3KeyPath,
} from "@/lib/s3";

// POST /api/admin/ai/generate-image — admin-only Gemini image generation.
// Generates an image from a text prompt, stores it in S3 + the media library,
// and returns a MediaItem so the media picker can insert it like any upload.
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "ai.manage"))) {
      return NextResponse.json(
        { error: "Forbidden — AI access required" },
        { status: 403 }
      );
    }

    if (!isS3Configured()) {
      return NextResponse.json({ error: "S3 not configured" }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }
    if (prompt.length > 1000) {
      return NextResponse.json(
        { error: "Prompt is too long (max 1000 characters)" },
        { status: 400 }
      );
    }

    const result = await generateImage(prompt);
    if (!result.success || !result.imageBase64) {
      return NextResponse.json(
        { error: result.error || "Image generation failed" },
        { status: 502 }
      );
    }

    const mimeType = result.mimeType || "image/png";
    const ext = mimeType.split("/")[1]?.split("+")[0] || "png";
    const buffer = Buffer.from(result.imageBase64, "base64");

    const uniqueFilename = generateMediaFilename(`ai-generated.${ext}`);
    const s3Key = getMediaS3KeyPath(mimeType, uniqueFilename);

    const uploadResult = await uploadFile(s3Key, buffer, mimeType, {
      originalFilename: uniqueFilename,
      uploadedBy: session.user.id,
      aiPrompt: prompt.slice(0, 256),
    });
    if (!uploadResult.success) {
      return NextResponse.json(
        { error: uploadResult.error || "Upload failed" },
        { status: 500 }
      );
    }

    const { s3Url, cloudFrontUrl } = getMediaUrl(s3Key);

    const mediaItem = await prisma.media.create({
      data: {
        filename: uniqueFilename,
        originalFilename: uniqueFilename,
        fileType: getMediaFileType(mimeType),
        mimeType,
        fileSize: buffer.length,
        s3Key,
        s3Url,
        cloudFrontUrl,
        altText: prompt.slice(0, 256),
        uploadedById: session.user.id,
      },
      include: {
        uploadedBy: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      url: cloudFrontUrl || s3Url,
      media: mediaItem,
    });
  } catch (error) {
    console.error("Error generating AI image:", error);
    return NextResponse.json(
      { error: "Failed to generate image" },
      { status: 500 }
    );
  }
}
