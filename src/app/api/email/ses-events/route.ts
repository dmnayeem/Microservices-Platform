import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSnsUrl, verifySnsMessage, type SnsMessage } from "@/lib/sns-verify";

/**
 * Amazon SES bounce and complaint feedback, delivered by Amazon SNS.
 *
 * SES → Configuration → Identity revtype.com → Notifications sends Bounce and
 * Complaint events to an SNS topic; that topic has an HTTPS subscription to
 * this URL. What happens here:
 *
 *   - SubscriptionConfirmation: confirmed automatically, but only for the
 *     topic(s) named in SES_SNS_TOPIC_ARN.
 *   - Permanent (hard) bounce or complaint: the address's account stops
 *     receiving optional email (`emailNotifications = false`). A complaint
 *     means "I don't want this"; a hard bounce means the mailbox is gone.
 *     Transactional mail to those addresses is already blocked by the SES
 *     account-level suppression list, which is on for both reasons.
 *   - Transient (soft) bounces are only logged — the mailbox exists and
 *     SES retries on its own.
 *
 * Every message's SNS signature is verified, and messages from any topic not
 * in SES_SNS_TOPIC_ARN are refused — otherwise anyone could point their own
 * SNS topic here and switch off a user's email with a fake complaint.
 */

function allowedTopics(): string[] {
  return (process.env.SES_SNS_TOPIC_ARN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

type SesEvent = {
  notificationType?: string;
  eventType?: string;
  mail?: { messageId?: string; source?: string };
  bounce?: {
    bounceType?: string;
    bounceSubType?: string;
    bouncedRecipients?: { emailAddress?: string; diagnosticCode?: string }[];
  };
  complaint?: {
    complaintFeedbackType?: string;
    complainedRecipients?: { emailAddress?: string }[];
  };
};

function bareAddress(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/<([^>]+)>/);
  const a = (m ? m[1] : raw).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+$/.test(a) ? a : null;
}

async function stopOptionalEmail(addresses: string[], reason: string) {
  for (const email of addresses) {
    const res = await prisma.user.updateMany({
      where: { email: { equals: email, mode: "insensitive" }, emailNotifications: true },
      data: { emailNotifications: false },
    });
    console.warn(
      JSON.stringify({ at: "ses-feedback", reason, email, accountsUpdated: res.count })
    );
  }
}

export async function POST(request: NextRequest) {
  let msg: SnsMessage;
  try {
    // SNS posts JSON with Content-Type text/plain.
    msg = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const topics = allowedTopics();
  if (!topics.length || !topics.includes(msg?.TopicArn)) {
    console.warn(JSON.stringify({ at: "ses-feedback", refused: "unknown topic", topic: String(msg?.TopicArn ?? "").slice(0, 200), configured: topics.length }));
    return NextResponse.json({ error: "unknown topic" }, { status: 403 });
  }
  if (!(await verifySnsMessage(msg))) {
    console.warn(JSON.stringify({ at: "ses-feedback", refused: "bad signature", type: msg.Type, sigVersion: msg.SignatureVersion, cert: String(msg.SigningCertURL ?? "").slice(0, 200) }));
    return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }

  if (msg.Type === "SubscriptionConfirmation") {
    if (!isSnsUrl(msg.SubscribeURL)) {
      return NextResponse.json({ error: "bad subscribe url" }, { status: 400 });
    }
    const ok = await fetch(msg.SubscribeURL!, { signal: AbortSignal.timeout(8000) })
      .then((r) => r.ok)
      .catch(() => false);
    console.warn(JSON.stringify({ at: "ses-feedback", subscribed: ok, topic: msg.TopicArn }));
    return NextResponse.json({ ok }, { status: ok ? 200 : 502 });
  }

  if (msg.Type !== "Notification") {
    return NextResponse.json({ ok: true });
  }

  let ev: SesEvent;
  try {
    ev = JSON.parse(msg.Message);
  } catch {
    return NextResponse.json({ ok: true });
  }
  const type = ev.notificationType || ev.eventType;

  try {
    if (type === "Bounce") {
      const addrs = (ev.bounce?.bouncedRecipients ?? [])
        .map((r) => bareAddress(r.emailAddress))
        .filter((a): a is string => Boolean(a));
      if (ev.bounce?.bounceType === "Permanent") {
        await stopOptionalEmail(addrs, `hard-bounce:${ev.bounce.bounceSubType ?? ""}`);
      } else {
        console.warn(
          JSON.stringify({ at: "ses-feedback", reason: `soft-bounce:${ev.bounce?.bounceSubType ?? ""}`, emails: addrs })
        );
      }
    } else if (type === "Complaint") {
      const addrs = (ev.complaint?.complainedRecipients ?? [])
        .map((r) => bareAddress(r.emailAddress))
        .filter((a): a is string => Boolean(a));
      await stopOptionalEmail(addrs, `complaint:${ev.complaint?.complaintFeedbackType ?? ""}`);
    }
  } catch (e) {
    // 500 makes SNS retry, so a database blip doesn't lose the event.
    console.error("ses-feedback failed", e);
    return NextResponse.json({ error: "retry" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
