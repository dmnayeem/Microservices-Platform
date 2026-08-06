import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { invalidateSettingsCache } from "@/lib/system-settings";
import { z } from "zod";

const schema = z.object({
  defaultDurationMin: z.number().int().min(1).max(60).default(5),
  minRewardPts: z.number().int().min(0).default(50),
  maxRewardPts: z.number().int().min(0).default(500),
  credentialTtlSec: z.number().int().min(60).max(900).default(180),
  minTimePercent: z.number().int().min(50).max(100).default(80),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "proxy.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.systemSetting.findMany({
    where: { category: "proxy" },
  });
  const config: Record<string, unknown> = {};
  for (const r of rows) config[r.key.replace("proxy_", "")] = r.value;
  return NextResponse.json({ config });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "proxy.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }
  if (v.data.maxRewardPts < v.data.minRewardPts) {
    return NextResponse.json(
      { error: "maxRewardPts must be ≥ minRewardPts" },
      { status: 400 }
    );
  }

  await Promise.all(
    Object.entries(v.data).map(([k, val]) =>
      prisma.systemSetting.upsert({
        where: { key: `proxy_${k}` },
        create: {
          key: `proxy_${k}`,
          category: "proxy",
          value: val as unknown as object,
        },
        update: {
          category: "proxy",
          value: val as unknown as object,
        },
      })
    )
  );

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "PROXY_CONFIG_UPDATED",
      entity: "SystemSetting",
      newData: v.data,
    },
  });

  invalidateSettingsCache();

  return NextResponse.json({ success: true, config: v.data });
}
