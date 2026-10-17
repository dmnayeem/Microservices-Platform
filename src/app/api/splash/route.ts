import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  SPLASH_LOGIN_WINDOW_MS,
  SPLASH_SETTING_KEY,
  normalizeSplashConfig,
} from "@/lib/splash";

const OFF = () => NextResponse.json({ enabled: false }, { headers: { "Cache-Control": "private, no-store" } });

/**
 * The splash for THIS member, or {enabled:false}.
 *
 * Owner, 2026-10-17: it showed to every visitor on the landing page and to
 * signed-in members on every app open. It is now offered only right after a
 * sign-in or registration (session.user.loginAt, within
 * SPLASH_LOGIN_WINDOW_MS); the browser shows it once for that sign-in.
 * Visitors and old sessions get nothing.
 */
export async function GET() {
  try {
    const session = await auth().catch(() => null);
    const loginAt = session?.user?.loginAt;
    if (!session?.user?.id || typeof loginAt !== "number" || Date.now() - loginAt > SPLASH_LOGIN_WINDOW_MS) {
      return OFF();
    }

    // Same row for everyone, changed only by an admin — minutes of staleness is fine.
    const row = await prisma.systemSetting.findUnique({
      where: { key: SPLASH_SETTING_KEY },
      cacheStrategy: { ttl: 300, swr: 900 },
    });
    const cfg = normalizeSplashConfig(row?.value);
    const usableSlides =
      cfg.mode === "images"
        ? cfg.slides.filter((s) => s.imageUrl)
        : cfg.slides.filter((s) => s.title || s.content || s.imageUrl);
    if (!cfg.enabled || usableSlides.length === 0) return OFF();

    if (cfg.audience === "new") {
      const u = await prisma.user.findUnique({ where: { id: session.user.id }, select: { createdAt: true } });
      if (!u || Date.now() - u.createdAt.getTime() > 24 * 60 * 60 * 1000) return OFF();
    }

    return NextResponse.json(
      {
        enabled: true,
        loginAt,
        mode: cfg.mode,
        audience: cfg.audience,
        durationMs: cfg.durationMs,
        slides: usableSlides,
        // Dates and devices are checked in the browser.
        startsAt: cfg.startsAt,
        endsAt: cfg.endsAt,
        deviceTypes: cfg.deviceTypes,
        deviceOses: cfg.deviceOses,
        deviceBrands: cfg.deviceBrands,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    return OFF();
  }
}
