// Server-side membership verification for auto-verified JOIN tasks (anti-fraud
// Phase C). A bot the admin controls confirms the user actually joined the
// target Telegram chat / Discord guild — impossible to fake with a screenshot.
//
// Returns:
//   "verified"     — the linked user is a member
//   "failed"       — the API answered and the user is NOT a member
//   "unverifiable" — we couldn't decide (no bot token, bad target, network) →
//                    the submit route falls back to manual review, never a
//                    silent pass.

import { getSecret } from "@/lib/system-settings";

export type MembershipResult = "verified" | "failed" | "unverifiable";

const TIMEOUT_MS = 8000;

/** Telegram: getChatMember → member/administrator/creator = joined. */
export async function verifyTelegramMember(
  chatId: string,
  platformUserId: string
): Promise<MembershipResult> {
  const token = await getSecret("TELEGRAM_BOT_TOKEN", "integrations.telegram_bot_token");
  if (!token || !chatId || !platformUserId) return "unverifiable";
  try {
    const url = `https://api.telegram.org/bot${token}/getChatMember?chat_id=${encodeURIComponent(
      chatId
    )}&user_id=${encodeURIComponent(platformUserId)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; result?: { status?: string } }
      | null;
    if (!data) return "unverifiable";
    if (!data.ok) {
      // Telegram returns ok:false for "user not found" (never joined / left).
      return "failed";
    }
    const status = data.result?.status;
    const joined =
      status === "member" ||
      status === "administrator" ||
      status === "creator" ||
      status === "restricted"; // restricted members are still in the chat
    return joined ? "verified" : "failed";
  } catch {
    return "unverifiable";
  }
}

/** Discord: GET guild member → 200 = joined, 404 = not a member. */
export async function verifyDiscordMember(
  guildId: string,
  platformUserId: string
): Promise<MembershipResult> {
  const token = await getSecret("DISCORD_BOT_TOKEN", "integrations.discord_bot_token");
  if (!token || !guildId || !platformUserId) return "unverifiable";
  try {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${encodeURIComponent(
        guildId
      )}/members/${encodeURIComponent(platformUserId)}`,
      {
        headers: { Authorization: `Bot ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
    if (res.status === 200) return "verified";
    if (res.status === 404) return "failed";
    return "unverifiable"; // 401/403 (bad token / missing intent), rate-limit, etc.
  } catch {
    return "unverifiable";
  }
}
