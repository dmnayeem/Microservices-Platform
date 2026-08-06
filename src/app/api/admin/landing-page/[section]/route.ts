import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { isSectionKey, settingKeyFor } from "@/lib/landing-content";
import { invalidateSettingsCache } from "@/lib/system-settings";
import type { Prisma } from "@/generated/prisma/client";

interface RouteParams {
  params: Promise<{ section: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "landing.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { section } = await params;
  if (!isSectionKey(section)) {
    return NextResponse.json(
      { error: `Unknown section: ${section}` },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Section payload must be an object" },
      { status: 400 }
    );
  }

  const key = settingKeyFor(section);
  const value = JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue;

  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value, category: "landing", description: null },
    update: { value, category: "landing" },
  });

  invalidateSettingsCache();

  return NextResponse.json({ ok: true, section });
}
