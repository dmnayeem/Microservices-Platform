import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { normalizeWidgetConfig } from "@/lib/feed-widgets";
import { normalizeQuickEarn } from "@/lib/feed-quick-earn";
import { normalizeCustomWidgets } from "@/lib/feed-custom-widgets";
import { invalidateSettingsCache } from "@/lib/system-settings";

const CATEGORY = "feed";
const KEYS = {
  widgets: "feed.sidebar_widgets",
  quickEarn: "feed.quick_earn_tiles",
  custom: "feed.custom_widgets",
  publicSharing: "feed.public_post_sharing",
} as const;

const schema = z.object({
  widgets: z.array(z.object({ id: z.string(), enabled: z.boolean() })),
  // Optional: the Quick Earn tiles are edited on Settings → Navigation (their
  // one editor) and the widgets form no longer sends them. Written only when
  // sent, so saving the widgets can never reset the tiles.
  quickEarn: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        href: z.string(),
        icon: z.string(),
        color: z.string(),
        enabled: z.boolean(),
      })
    )
    .optional(),
  // Optional so an older client that does not send it cannot silently switch
  // public sharing OFF — or, far worse, default it ON.
  publicSharing: z.boolean().optional(),
  customWidgets: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["promo", "links"]),
      title: z.string(),
      subtitle: z.string().optional(),
      href: z.string().optional(),
      gradient: z.string().optional(),
      links: z
        .array(z.object({ label: z.string(), href: z.string() }))
        .optional(),
    })
  ),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "settings.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: Object.values(KEYS) } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const customWidgets = normalizeCustomWidgets(map.get(KEYS.custom));
  return NextResponse.json({
    widgets: normalizeWidgetConfig(
      map.get(KEYS.widgets),
      customWidgets.map((c) => c.id)
    ),
    quickEarn: normalizeQuickEarn(map.get(KEYS.quickEarn)),
    customWidgets,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "settings.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const v = schema.safeParse(await req.json());
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }

  // Normalize/clean each payload before persisting.
  const customWidgets = normalizeCustomWidgets(v.data.customWidgets);
  const quickEarn = v.data.quickEarn ? normalizeQuickEarn(v.data.quickEarn) : undefined;
  const widgets = normalizeWidgetConfig(
    v.data.widgets,
    customWidgets.map((c) => c.id)
  );

  const writes: Array<[string, unknown]> = [
    [KEYS.widgets, widgets],
    [KEYS.custom, customWidgets],
  ];
  if (quickEarn) writes.push([KEYS.quickEarn, quickEarn]);
  // Only written when the client actually sent it, so a partial payload leaves
  // the switch exactly as the owner set it.
  if (typeof v.data.publicSharing === "boolean") {
    writes.push([KEYS.publicSharing, v.data.publicSharing]);
  }
  await Promise.all(
    writes.map(([key, value]) =>
      prisma.systemSetting.upsert({
        where: { key },
        create: { key, category: CATEGORY, value: value as object },
        update: { category: CATEGORY, value: value as object },
      })
    )
  );

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "FEED_WIDGETS_CONFIG_UPDATED",
      entity: "SystemSetting",
      // The sharing switch is the one setting here with a privacy consequence,
      // so who flipped it and when has to be on the record.
      newData: JSON.parse(
        JSON.stringify({
          widgets,
          quickEarn,
          customWidgets,
          ...(typeof v.data.publicSharing === "boolean"
            ? { publicPostSharing: v.data.publicSharing }
            : {}),
        })
      ),
    },
  });

  invalidateSettingsCache();

  return NextResponse.json({ success: true, widgets, quickEarn, customWidgets });
}
