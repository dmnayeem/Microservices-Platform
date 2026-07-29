import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSecret } from "@/lib/system-settings";
import { signOAuthState } from "@/lib/oauth-state";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// GET /api/integrations/discord/start — kick off Discord OAuth (identify scope)
// so we can capture the user's Discord id for bot membership verification.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(`${APP_URL}/login`);
  }
  const clientId = await getSecret("DISCORD_CLIENT_ID", "integrations.discord_client_id");
  if (!clientId) {
    return NextResponse.redirect(
      `${APP_URL}/profile?link=discord&status=error&reason=not_configured`
    );
  }
  const redirectUri = `${APP_URL}/api/integrations/discord/callback`;
  const url =
    `https://discord.com/api/oauth2/authorize?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code&scope=identify` +
    `&state=${encodeURIComponent(signOAuthState(session.user.id))}`;
  return NextResponse.redirect(url);
}
