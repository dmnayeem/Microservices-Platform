import "server-only";
import { screenLinks } from "@/lib/link-safety";
import { encodeEmailBody, toEmailSafeHtml } from "@/lib/email-html";
import { getEmailBrand, renderNotificationEmail, type RenderedEmail } from "@/lib/email";
import { unsubscribeUrls } from "@/lib/unsubscribe";

/**
 * The broadcast composer's email body, between the form and the database.
 *
 * Shared by the send route, the live preview and "Send test to me", so what
 * the admin previews is byte-for-byte what recipients get.
 */

const MAX_HTML = 100_000;
const MAX_TEXT = 5_000;

export type FlaggedLink = { url: string; status: string; reason: string };

export async function prepareBroadcastEmail(
  input: { emailBody?: string | null; emailHtml?: string | null; emailPreheader?: string | null; actionUrl?: string | null },
  ctx: { userId: string }
): Promise<
  | { error: string }
  | { emailBody: string | null; flaggedLinks: FlaggedLink[]; dropped: string[]; reportLinks: (id: string) => void }
> {
  const preheader = String(input.emailPreheader ?? "").trim().slice(0, 200);
  const rawHtml = String(input.emailHtml ?? "").trim();

  if (rawHtml) {
    if (rawHtml.length > MAX_HTML) return { error: "The email body is too long (100,000 characters max)." };
    const site = (process.env.NEXT_PUBLIC_APP_URL || "https://revtype.com").replace(/\/+$/, "");
    const safe = toEmailSafeHtml(rawHtml, { baseUrl: site });
    if (!safe.html.replace(/<[^>]+>/g, "").trim() && safe.images.length === 0) {
      return { error: "The email body is empty." };
    }
    // Flag only: a broadcast is staff-written, so nothing is refused here — a
    // suspicious link raises an abuse signal for review instead.
    const screen = await screenLinks(
      { urls: [...safe.links, ...safe.images, input.actionUrl ?? null] },
      { userId: ctx.userId, entityType: "broadcast", enforcement: "never" }
    );
    return {
      // The editor HTML is stored as written (sanitised); it is made
      // email-safe again at send time, so a fix to the converter reaches
      // broadcasts already queued.
      emailBody: encodeEmailBody({ format: "html", body: rawHtml, preheader }),
      flaggedLinks: screen.flagged.map((v) => ({ url: v.url, status: v.status, reason: v.reasons[0] ?? v.status })),
      dropped: safe.dropped,
      reportLinks: (id: string) => screen.report(id),
    };
  }

  const text = String(input.emailBody ?? "").trim();
  if (text.length > MAX_TEXT) return { error: "The email body is too long (5,000 characters max)." };
  return {
    emailBody: text || preheader ? encodeEmailBody({ format: "text", body: text, preheader }) : null,
    flaggedLinks: [],
    dropped: [],
    reportLinks: () => {},
  };
}

/** Render the composer's email exactly as a recipient would get it. */
export async function renderBroadcastEmail(
  f: {
    title: string;
    message: string;
    emailSubject?: string | null;
    emailBody?: string | null;
    emailHtml?: string | null;
    emailPreheader?: string | null;
    actionUrl?: string | null;
    actionLabel?: string | null;
    imageUrl?: string | null;
    style?: string | null;
    kicker?: string | null;
    important?: boolean;
  },
  forUserId: string
): Promise<RenderedEmail & { unsubscribe: boolean }> {
  const brand = await getEmailBrand();
  const html = String(f.emailHtml ?? "").trim();
  const subject = (f.emailSubject || f.title || "").trim() || "(no subject)";
  const unsubscribe = f.important ? null : unsubscribeUrls(brand.siteUrl, forUserId);
  const m = renderNotificationEmail(
    brand,
    subject,
    html ? f.message : String(f.emailBody ?? "").trim() || f.message,
    f.actionUrl || undefined,
    {
      style: f.style ?? undefined,
      kicker: f.kicker ?? undefined,
      imageUrl: f.imageUrl ?? undefined,
      actionLabel: f.actionLabel ?? undefined,
      html: html || undefined,
      preheader: f.emailPreheader ?? undefined,
      unsubscribe,
    }
  );
  return { ...m, unsubscribe: !!unsubscribe };
}
