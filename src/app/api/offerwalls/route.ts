import { assertPageVisible } from "@/lib/page-visibility-server";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * User-facing offerwall summary: active providers (with a per-user wall URL)
 * plus this user's callback stats. Powers the Earn hub Offerwall tab and the
 * dedicated /offerwalls page. Returns empty lists (never errors) when nothing
 * is configured.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Super-admin page visibility: refuse when /offerwalls is hidden for this user.
  const pageHidden = await assertPageVisible(session.user.id, "/offerwalls");
  if (pageHidden) return pageHidden;
  const userId = session.user.id;

  const [configs, pending, approved, total] = await Promise.all([
    prisma.offerwallConfig.findMany({
      where: { isActive: true },
      orderBy: { provider: "asc" },
    }),
    prisma.offerwallCallback.count({ where: { userId, status: "PENDING" } }),
    prisma.offerwallCallback.count({ where: { userId, status: "APPROVED" } }),
    prisma.offerwallCallback.count({ where: { userId } }),
  ]);

  const providers = configs.map((c) => {
    const cfg =
      c.config && typeof c.config === "object" && !Array.isArray(c.config)
        ? (c.config as { iframeUrl?: string; testMode?: boolean })
        : {};
    const raw = (cfg.iframeUrl ?? "").trim();
    const url = raw ? raw.replace(/\{userId\}/g, encodeURIComponent(userId)) : undefined;
    return {
      id: c.id,
      name: c.provider.replace(/_/g, " "),
      status: cfg.testMode
        ? ("MAINTENANCE" as const)
        : ("ACTIVE" as const),
      url,
    };
  });

  return NextResponse.json({ pending, approved, total, providers });
}
