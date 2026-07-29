import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSetting, getSecret } from "@/lib/system-settings";

// GET /api/integrations/config — non-secret linking config for the profile UI:
// the Telegram bot username (for the Login Widget), whether Discord linking is
// configured, and this user's current linked accounts.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [telegramBotUsername, discordClientId, links] = await Promise.all([
    getSetting<string>("integrations.telegram_bot_username", ""),
    getSecret("DISCORD_CLIENT_ID", "integrations.discord_client_id"),
    prisma.linkedPlatformAccount.findMany({
      where: { userId: session.user.id },
      select: { platform: true, username: true, linkedAt: true },
    }),
  ]);

  return NextResponse.json({
    telegramBotUsername: telegramBotUsername || null,
    discordEnabled: !!discordClientId,
    links,
  });
}
