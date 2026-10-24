import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAllowedGameOrigin, normalizeOrigin } from "@/lib/game-connect";
import { ConnectGamesClient } from "./connect-client";

export const metadata: Metadata = { title: "Connect RevType", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The "Connect RevType" popup opened by the RevType Games SDK on the owner's
 * game website. Signed out → /login (or /register) and back here; signed in →
 * "Allow <site> to add game points to your account?".
 */
export default async function ConnectGamesPage({
  searchParams,
}: {
  searchParams: Promise<{ origin?: string; return?: string }>;
}) {
  const sp = await searchParams;
  const origin = normalizeOrigin(sp.origin);
  const allowed = !!origin && (await isAllowedGameOrigin(origin));
  // Where to send the player back when the popup has no opener (blocked popup).
  const returnUrl =
    allowed && sp.return && normalizeOrigin(sp.return) === origin ? sp.return : origin ?? null;

  const session = await auth();
  if (!session?.user?.id) {
    const here = `/connect/games?origin=${encodeURIComponent(sp.origin ?? "")}${
      sp.return ? `&return=${encodeURIComponent(sp.return)}` : ""
    }`;
    redirect(`/login?callbackUrl=${encodeURIComponent(here)}`);
  }

  const [user, priorConnect] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, username: true, email: true },
    }),
    // Already allowed this website before? (Recorded by /api/games/connect.)
    // Then don't ask again — this page used to come back on every Back press
    // after connecting inside the installed app, asking for "Allow" each time.
    allowed && origin
      ? prisma.auditLog.findFirst({
          where: {
            action: "GAME_SITE_CONNECTED",
            targetUserId: session.user.id,
            summary: `Connected the game website ${origin}`,
          },
          select: { id: true },
        })
      : null,
  ]);

  return (
    <main className="min-h-dvh grid place-items-center bg-slate-950 px-4 py-10">
      <ConnectGamesClient
        origin={allowed ? origin : null}
        returnUrl={returnUrl}
        name={user?.name || user?.username || "RevType member"}
        email={user?.email ?? ""}
        alreadyAllowed={!!priorConnect}
      />
    </main>
  );
}
