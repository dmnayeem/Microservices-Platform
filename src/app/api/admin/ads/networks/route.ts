import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { getNetworkGlobals } from "@/lib/ad-network";
import { getNetworkSettings, saveNetworkSettings } from "@/lib/ad-networks/settings";
import { AD_NETWORKS, normalizeNetworkSettings } from "@/lib/ad-networks/registry";

/**
 * Per-network settings for /admin/ads/networks: enabled, publisher id,
 * "allowed on paid pages", extra ads.txt lines, plus the page-script-vs-Google
 * switch. Google's own ids are read here for display only — they stay owned by
 * Monetization (`ads.adsense_client` / `ads.gam_network_code`).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [settings, google] = await Promise.all([getNetworkSettings(), getNetworkGlobals()]);
  return NextResponse.json({
    settings,
    google,
    frameOrigin: process.env.AD_FRAME_ORIGIN ? String(process.env.AD_FRAME_ORIGIN) : null,
  });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const before = await getNetworkSettings();
  const next = normalizeNetworkSettings(body?.settings);
  // Google rows are configured in Monetization; whatever arrives for them here
  // is ignored except that they can never be allowed on paid pages
  // (normalizeNetworkSettings enforces that too).
  for (const n of AD_NETWORKS) {
    if (n.google) next.networks[n.id] = { ...before.networks[n.id], allowOnPaid: false };
  }
  await saveNetworkSettings(next);

  const changed = AD_NETWORKS.filter(
    (n) => JSON.stringify(before.networks[n.id]) !== JSON.stringify(next.networks[n.id])
  ).map((n) => n.name);
  await writeAudit({
    actorId: session.user.id,
    action: "AD_NETWORKS_UPDATED",
    entity: "SystemSetting",
    entityId: "ads.networks",
    summary: changed.length
      ? `Updated ad network settings (${changed.join(", ")})`
      : "Saved ad network settings",
    meta: {
      changed,
      enabled: AD_NETWORKS.filter((n) => next.networks[n.id]?.enabled).map((n) => n.id),
      pageScriptsWithGoogle: next.pageScriptsWithGoogle,
    },
  });
  return NextResponse.json({ settings: next });
}
