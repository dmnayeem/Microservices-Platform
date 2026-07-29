import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSecret } from "@/lib/system-settings";
import { verifyOAuthState } from "@/lib/oauth-state";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// GET /api/integrations/discord/callback — Discord OAuth redirect. Verifies the
// signed state (must match the logged-in user), exchanges the code, reads the
// Discord user id, and links it.
export async function GET(request: NextRequest) {
  const back = (ok: boolean, reason?: string) =>
    NextResponse.redirect(
      `${APP_URL}/profile?link=discord&status=${ok ? "ok" : "error"}${
        reason ? `&reason=${reason}` : ""
      }`
    );

  const session = await auth();
  if (!session?.user?.id) return back(false, "not_logged_in");

  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const stateUser = verifyOAuthState(params.get("state"));
  if (!code) return back(false, "missing_code");
  if (!stateUser || stateUser !== session.user.id) return back(false, "bad_state");

  const [clientId, clientSecret] = await Promise.all([
    getSecret("DISCORD_CLIENT_ID", "integrations.discord_client_id"),
    getSecret("DISCORD_CLIENT_SECRET", "integrations.discord_client_secret"),
  ]);
  if (!clientId || !clientSecret) return back(false, "not_configured");

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${APP_URL}/api/integrations/discord/callback`,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const tokenData = (await tokenRes.json().catch(() => null)) as
      | { access_token?: string }
      | null;
    if (!tokenData?.access_token) return back(false, "token_exchange_failed");

    const meRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      signal: AbortSignal.timeout(8000),
    });
    const me = (await meRes.json().catch(() => null)) as
      | { id?: string; username?: string }
      | null;
    if (!me?.id) return back(false, "profile_failed");

    await prisma.linkedPlatformAccount.upsert({
      where: {
        userId_platform: { userId: session.user.id, platform: "DISCORD" },
      },
      create: {
        userId: session.user.id,
        platform: "DISCORD",
        platformUserId: me.id,
        username: me.username ?? null,
      },
      update: { platformUserId: me.id, username: me.username ?? null, linkedAt: new Date() },
    });
  } catch {
    return back(false, "error");
  }
  return back(true);
}
