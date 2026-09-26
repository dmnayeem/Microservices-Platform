import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { invalidateSettingsCache, primeSetting } from "@/lib/system-settings";
import { ID_FORMATS, SEO_DEFAULTS, SEO_KEYS, SUPER_ONLY_KEYS, type SeoKey } from "@/lib/seo-settings";

export const runtime = "nodejs";

const MAX_LEN: Partial<Record<SeoKey, number>> = {
  "seo.description": 320,
  "seo.default_title": 120,
  "seo.title_template": 120,
  "seo.keywords": 1000,
  "seo.org_description": 500,
  "seo.org_same_as": 3000,
  "code.head": 20000,
  "code.body": 20000,
};

/** `<meta name="…" content="XYZ">` pasted whole → just XYZ. */
function extractContent(v: string): string {
  const m = v.match(/content\s*=\s*["']([^"']+)["']/i);
  return (m ? m[1] : v).trim();
}

/**
 * PUT { values: { key: value } } — save /admin/seo. Only known keys; tracking
 * IDs and verification codes must match their format; custom code is super
 * admin only (it runs on every visitor's page). Audited.
 */
export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "settings.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { values?: Record<string, unknown> };
  const values = body.values && typeof body.values === "object" ? body.values : {};
  const isSuper = session.user.role === "SUPER_ADMIN";

  const clean: Array<[SeoKey, string | boolean]> = [];
  for (const [k, raw] of Object.entries(values)) {
    if (!SEO_KEYS.includes(k as SeoKey)) continue;
    const key = k as SeoKey;
    if (SUPER_ONLY_KEYS.includes(key) && !isSuper) continue; // silently kept as they were
    const d = SEO_DEFAULTS[key];
    if (typeof d === "boolean") {
      clean.push([key, raw === true]);
      continue;
    }
    let v = String(raw ?? "").trim();
    if (key.startsWith("seo.verify_")) v = extractContent(v);
    const max = MAX_LEN[key] ?? 300;
    if (v.length > max) {
      return NextResponse.json({ error: `${key} is too long (max ${max} characters).` }, { status: 400 });
    }
    const fmt = ID_FORMATS[key];
    if (v && fmt && !fmt.re.test(v)) {
      return NextResponse.json(
        { error: `That does not look like a valid ${key.replace(/^[a-z]+\./, "").replace(/_/g, " ")} — expected something like ${fmt.example}.` },
        { status: 400 }
      );
    }
    if (key === "seo.title_template" && v && !v.includes("%s")) {
      return NextResponse.json({ error: "The title template must contain %s (where each page's own title goes)." }, { status: 400 });
    }
    if ((key === "tracking.scope" || key === "code.scope") && !["all", "public"].includes(v)) continue;
    clean.push([key, v]);
  }

  for (const [key, value] of clean) {
    await prisma.systemSetting.upsert({
      where: { key },
      create: { key, value, category: key.split(".")[0] },
      update: { value, category: key.split(".")[0] },
    });
  }
  invalidateSettingsCache();
  for (const [key, value] of clean) primeSetting(key, value);

  await writeAudit({
    actorId: session.user.id,
    action: "SEO_SETTINGS_SAVED",
    entity: "SystemSetting",
    summary: `Saved SEO & tracking settings (${clean.length} field${clean.length === 1 ? "" : "s"})`,
    meta: { keys: clean.map(([k]) => k) },
  }).catch(() => {});

  return NextResponse.json({ ok: true, saved: clean.length });
}
