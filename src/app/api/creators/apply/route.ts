import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createCreatorApplication } from "@/lib/creator-application";
import type { CreatorApplicationType } from "@/generated/prisma";

const applySchema = z.object({
  type: z.enum(["MARKETPLACE_SELLER", "ADVERTISER", "AGENCY", "AFFILIATE"]),
  message: z.string().trim().min(20, "Tell us a bit more (min 20 chars).").max(2000),
  links: z.array(z.string().url()).max(6).optional(),
  payload: z.record(z.string(), z.string().max(1000)).optional(),
});

// POST /api/creators/apply — submit a creator/seller application.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { type, message, links, payload } = parsed.data;
  try {
    const app = await createCreatorApplication(
      session.user.id,
      type as CreatorApplicationType,
      { message, links, payload: payload ?? null }
    );
    return NextResponse.json({ application: { id: app.id, status: app.status } }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to apply" },
      { status: 400 }
    );
  }
}
