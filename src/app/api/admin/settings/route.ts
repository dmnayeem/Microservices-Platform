import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { isSuperAdmin, type UserRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { invalidatePointsRateCache } from "@/lib/economy";
import {
  invalidateSettingsCache,
  primeSetting,
} from "@/lib/system-settings";
import { invalidateUiTogglesCache } from "@/lib/ui-toggles-server";
import { validateSettingValues } from "@/lib/setting-guards";
import { TEST_USERS_SETTING_KEY } from "@/lib/finance/test-users-core";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "settings.view"))) {
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

    if (!(await can(session.user.id, "settings.edit"))) {
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

    // Keys that decide who may do what. `settings.edit` is held by ordinary
    // admins, and this route writes any key — so an admin could rewrite the
    // role→permission table and grant themselves anything. Only a super admin
    // writes these (and only through here or their dedicated routes).
    const RESERVED_PREFIXES = ["rbac.", "page_visibility.", "admin_modules."];
    const reserved = Object.keys(settings).filter((k) =>
      RESERVED_PREFIXES.some((p) => k.startsWith(p))
    );
    if (
      reserved.length > 0 &&
      !isSuperAdmin(session.user.role as UserRole | undefined)
    ) {
      return NextResponse.json(
        { error: `Only a super admin can change ${reserved.join(", ")}` },
        { status: 403 }
      );
    }

    // The finance test-user list hides those accounts from every finance
    // report. It is written only by /api/admin/finance/test-users (finance
    // permission, per-user audit, 500 cap) — never by `settings.edit` here,
    // which would let a non-finance admin hide real users' money.
    if (TEST_USERS_SETTING_KEY in settings) {
      return NextResponse.json(
        { error: "Finance test users are managed on the Finance screen." },
        { status: 403 }
      );
    }

    // This route used to upsert any key with any value. `points_per_usd` alone
    // is enough to revalue every balance on the platform by 1000× on a single
    // mistyped digit, so the money-critical keys are bounded now.
    const rejections = validateSettingValues(settings);
    if (rejections.length > 0) {
      return NextResponse.json(
        { error: rejections[0].message, rejections },
        { status: 400 }
      );
    }

    // Chunked: an unbounded Promise.all opens one connection per key against
    // the Accelerate pool.
    const entries = Object.entries(settings);
    const CHUNK = 20;
    for (let i = 0; i < entries.length; i += CHUNK) {
      await Promise.all(
        entries.slice(i, i + CHUNK).map(([key, value]) =>
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
        )
      );
    }

    // Flush caches so changed settings take effect immediately.
    invalidateSettingsCache();
    // Clearing is not enough on its own. `getSetting` reads through an
    // Accelerate `cacheStrategy`, and that edge cache is not ours to clear, so
    // the next read can still return the OLD row — or, the first time a key is
    // ever written, the cached ABSENCE of it, which reads as the fallback. The
    // admin then saves, reloads, sees no change, and saves again.
    for (const [key, value] of entries) primeSetting(key, value);
    invalidateUiTogglesCache();
    if ("points_per_usd" in settings) invalidatePointsRateCache();

    // These keys decide what money is worth. Without a trail there is no way to
    // answer "who changed the rate, and when" after the fact.
    await prisma.auditLog
      .create({
        data: {
          userId: session.user.id,
          action: "SYSTEM_SETTINGS_UPDATED",
          entity: "SystemSetting",
          entityId: category,
          // Round-tripped rather than cast: the body is `unknown`-valued, and a
          // cast would let a non-serialisable value through to the JSON column.
          newData: JSON.parse(
            JSON.stringify({
              category,
              keys: Object.keys(settings),
              settings,
            })
          ),
        },
      })
      .catch(() => {
        // Best-effort — the save itself already stands.
      });

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
