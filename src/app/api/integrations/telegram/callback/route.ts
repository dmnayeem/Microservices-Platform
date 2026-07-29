import { NextRequest, NextResponse } from "next/server";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSecret } from "@/lib/system-settings";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
// Reject widget payloads older than this (replay protection).
const MAX_AUTH_AGE_SECONDS = 60 * 10;

// GET /api/integrations/telegram/callback — Telegram Login Widget redirect.
// Verifies the signed payload with the bot token, then links the Telegram
// user-id to the current app user so JOIN tasks can be bot-verified.
export async function GET(request: NextRequest) {
  const back = (ok: boolean, reason?: string) =>
    NextResponse.redirect(
      `${APP_URL}/profile?link=telegram&status=${ok ? "ok" : "error"}${
        reason ? `&reason=${reason}` : ""
      }`
    );

  const session = await auth();
  if (!session?.user?.id) return back(false, "not_logged_in");

  const token = await getSecret("TELEGRAM_BOT_TOKEN", "integrations.telegram_bot_token");
  if (!token) return back(false, "not_configured");

  // Collect widget params. `hash` is excluded from the check string.
  const params = new URL(request.url).searchParams;
  const hash = params.get("hash");
  const id = params.get("id");
  if (!hash || !id) return back(false, "missing_params");

  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== "hash") pairs.push(`${key}=${value}`);
  });
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  // secret = SHA256(bot_token); expected = HMAC-SHA256(dataCheckString, secret).
  const secret = createHash("sha256").update(token).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return back(false, "bad_signature");
  }

  const authDate = parseInt(params.get("auth_date") || "0", 10);
  if (!authDate || Date.now() / 1000 - authDate > MAX_AUTH_AGE_SECONDS) {
    return back(false, "expired");
  }

  const username =
    params.get("username") ||
    [params.get("first_name"), params.get("last_name")]
      .filter(Boolean)
      .join(" ") ||
    null;

  try {
    await prisma.linkedPlatformAccount.upsert({
      where: {
        userId_platform: { userId: session.user.id, platform: "TELEGRAM" },
      },
      create: {
        userId: session.user.id,
        platform: "TELEGRAM",
        platformUserId: id,
        username,
      },
      update: { platformUserId: id, username, linkedAt: new Date() },
    });
  } catch {
    return back(false, "save_failed");
  }
  return back(true);
}
