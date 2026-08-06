import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  provider: z.string().min(2).max(50),
  apiKey: z.string().optional().nullable(),
  secretKey: z.string().optional().nullable(),
  callbackUrl: z.string().optional().nullable(),
  isActive: z.boolean().default(false),
  config: z.record(z.string(), z.unknown()).optional().nullable(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (
    !(await can(session.user.id, "offerwalls.manage"))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }
  const existing = await prisma.offerwallConfig.findUnique({
    where: { provider: v.data.provider },
  });
  if (existing) {
    return NextResponse.json(
      { error: `Provider "${v.data.provider}" already exists` },
      { status: 409 }
    );
  }
  const ow = await prisma.offerwallConfig.create({
    data: {
      ...v.data,
      config: v.data.config
        ? JSON.parse(JSON.stringify(v.data.config))
        : undefined,
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "OFFERWALL_CREATED",
      entity: "OfferwallConfig",
      entityId: ow.id,
      newData: { provider: ow.provider, isActive: ow.isActive },
    },
  });
  return NextResponse.json({ success: true, offerwall: ow }, { status: 201 });
}
