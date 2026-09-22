/**
 * What a QR drawn from this account would actually give the person scanning it.
 *
 * The QR is scanned at the moment of payment, from inside a wallet app, so the
 * only question that matters is whether the app can act on what it reads:
 *
 * - `address` — a wallet address. The address IS the payment payload; every
 *   wallet reads one and opens a send screen. This is what generating is for.
 * - `link`    — a pay link or payment URI (`https://…`, `bitcoin:…`). Also
 *   actionable: the phone opens it.
 * - `plain`   — a UID, a phone number, an email. Scanning gives the payer that
 *   text and nothing happens. Worse than showing no QR at all, because the
 *   payer expects a screen that reacts and blames the site when it doesn't.
 *   These methods need the QR exported from the provider's own app
 *   (Bitget: Pay → Receive · bKash/Nagad: My QR · Binance: Pay → Receive).
 */
export function qrPayloadKind(account: string): "address" | "link" | "plain" {
  const v = account.trim();
  if (!v) return "plain";
  // A scheme means the scanner has something to open, whatever follows it.
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return "link";
  if (v.includes("@") || /\s/.test(v)) return "plain";
  // Crypto addresses are long, single-token and mixed alphanumeric. A UID or a
  // phone number is short and all digits, which is the case being caught here.
  if (/^[0-9]+$/.test(v)) return "plain";
  const long = v.length >= 26 && v.length <= 120;
  return long && /^[A-Za-z0-9:_-]+$/.test(v) ? "address" : "plain";
}
