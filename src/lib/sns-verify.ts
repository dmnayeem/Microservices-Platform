import "server-only";
import { createVerify, X509Certificate } from "node:crypto";

/**
 * Verify that a message really came from Amazon SNS.
 *
 * https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
 *
 * The signing certificate is fetched only from an `sns.<region>.amazonaws.com`
 * https URL — never from wherever the message says — and the string that was
 * signed is rebuilt from the documented fields in their documented order.
 */

export type SnsMessage = {
  Type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation" | string;
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  Signature: string;
  SignatureVersion: string;
  SigningCertURL: string;
  Subject?: string;
  SubscribeURL?: string;
  Token?: string;
};

const SNS_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/;

export function isSnsUrl(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && SNS_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

const certCache = new Map<string, string>();

async function signingCert(url: string): Promise<string | null> {
  if (!isSnsUrl(url) || !new URL(url).pathname.endsWith(".pem")) return null;
  const hit = certCache.get(url);
  if (hit) return hit;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!res?.ok) return null;
  const pem = await res.text();
  try {
    const cert = new X509Certificate(pem);
    if (new Date(cert.validTo).getTime() < Date.now()) return null;
  } catch {
    return null;
  }
  if (certCache.size > 20) certCache.clear();
  certCache.set(url, pem);
  return pem;
}

function stringToSign(m: SnsMessage): string | null {
  const keys =
    m.Type === "Notification"
      ? ["Message", "MessageId", ...(m.Subject !== undefined ? ["Subject"] : []), "Timestamp", "TopicArn", "Type"]
      : m.Type === "SubscriptionConfirmation" || m.Type === "UnsubscribeConfirmation"
        ? ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"]
        : null;
  if (!keys) return null;
  let s = "";
  for (const k of keys) {
    const v = (m as Record<string, unknown>)[k];
    if (typeof v !== "string") return null;
    s += `${k}\n${v}\n`;
  }
  return s;
}

export async function verifySnsMessage(m: SnsMessage): Promise<boolean> {
  if (!m || typeof m !== "object" || typeof m.Signature !== "string") return false;
  const algo = m.SignatureVersion === "2" ? "RSA-SHA256" : m.SignatureVersion === "1" ? "RSA-SHA1" : null;
  if (!algo) return false;
  // Reject replays of old messages (SNS retries for at most about an hour).
  const ts = Date.parse(m.Timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 2 * 60 * 60 * 1000) return false;
  const data = stringToSign(m);
  if (!data) return false;
  const pem = await signingCert(m.SigningCertURL);
  if (!pem) return false;
  try {
    return createVerify(algo).update(data, "utf8").verify(pem, m.Signature, "base64");
  } catch {
    return false;
  }
}
