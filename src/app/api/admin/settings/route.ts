import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { invalidatePointsRateCache } from "@/lib/economy";
import { invalidateSettingsCache } from "@/lib/system-settings";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminRole = session.user.role as UserRole | undefined;
    if (!hasPermission(adminRole, "settings.view")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const settings = await prisma.systemSetting.findMany({
      orderBy: [{ category: "asc" }, { key: "asc" }],
    });

    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminRole = session.user.role as UserRole | undefined;
    if (!hasPermission(adminRole, "settings.edit")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { category, settings } = body as {
      category: string;
      settings: Record<string, unknown>;
    };

    if (!category || !settings) {
      return NextResponse.json(
        { error: "Category and settings are required" },
        { status: 400 }
      );
    }

    // Upsert each setting
    const upsertPromises = Object.entries(settings).map(([key, value]) =>
      prisma.systemSetting.upsert({
        where: { key },
        create: {
          key,
          value: value as object,
          category,
          description: null,
        },
        update: {
          value: value as object,
          category,
        },
      })
    );

    await Promise.all(upsertPromises);

    // Flush caches so changed settings take effect immediately.
    invalidateSettingsCache();
    if ("points_per_usd" in settings) invalidatePointsRateCache();

    return NextResponse.json({
      success: true,
      message: "Settings saved successfully",
    });
  } catch (error) {
    console.error("Error saving settings:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
