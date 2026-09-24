import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { isGeminiConfigured } from "@/lib/gemini";
import { generateListingMetadata } from "@/lib/marketplace-studio";
import { z } from "zod";

/**
 * Re-roll the sales copy on its own.
 *
 * Separate from the asset route so an admin who dislikes the wording can ask
 * again for pennies instead of regenerating the image and paying for it twice.
 */
export const runtime = "nodejs";

const schema = z.object({
  assetType: z.string().min(2).max(40),
  subType: z.string().nullable().optional(),
  subject: z.string().min(3).max(600),
  brandId: z.string().nullable().optional(),
  audience: z.string().max(200).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "marketplace.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await isGeminiConfigured())) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set — add it in Settings → Integrations" },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json({ error: "Invalid input", details: v.error.issues }, { status: 400 });
  }

  let brandName: string | null = null;
  if (v.data.brandId) {
    const brand = await prisma.marketplaceBrand.findUnique({
      where: { id: v.data.brandId },
      select: { name: true },
    });
    brandName = brand?.name ?? null;
  }

  const meta = await generateListingMetadata({
    assetType: v.data.assetType,
    subType: v.data.subType ?? null,
    subject: v.data.subject,
    brandName,
    audience: v.data.audience ?? null,
  });
  if (!meta.success) {
    return NextResponse.json({ error: meta.error }, { status: 502 });
  }

  return NextResponse.json({ metadata: meta.data });
}
