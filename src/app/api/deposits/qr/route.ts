import { NextRequest } from "next/server";
import QRCode from "qrcode";
import { getEnabledDepositMethods } from "@/lib/deposit-methods";

/**
 * GET /api/deposits/qr?method=<key> → a PNG of that method's receiving account.
 *
 * A crypto address is the one thing on the deposit screen that cannot be
 * retyped: 34 characters of mixed case where a single wrong character sends
 * the money nowhere recoverable. Scanning is how people actually move an
 * address from a screen to a phone wallet, so the QR is part of the payment
 * instruction, not decoration.
 *
 * Drawn here rather than uploaded by the admin, because an uploaded image goes
 * stale silently: change the receiving address in settings and the old QR keeps
 * paying the old wallet, with nothing to notice it by. Drawing from the same
 * field the page displays means the two can never disagree.
 *
 * The account is NOT taken from the query string. It is looked up from the
 * saved method, so this cannot be used to render a QR for an arbitrary address
 * — a link that made one would be a ready-made way to hand someone a payment
 * code for a wallet we do not own.
 */
export async function GET(req: NextRequest) {
  const key = (req.nextUrl.searchParams.get("method") ?? "").trim().toLowerCase();
  if (!key) return new Response("method required", { status: 400 });

  const method = (await getEnabledDepositMethods()).find((m) => m.key === key);
  // Same answer for "no such method" and "not enabled": neither is something a
  // caller needs distinguished, and both mean there is nothing to pay to.
  if (!method?.account.trim()) {
    return new Response("not found", { status: 404 });
  }

  const png = await QRCode.toBuffer(method.account.trim(), {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
    color: { dark: "#000000", light: "#ffffff" },
  });

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // Short: the admin can change the receiving account at any time, and a
      // long cache would keep paying the previous one.
      "Cache-Control": "public, max-age=60, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
