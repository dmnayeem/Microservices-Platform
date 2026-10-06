// Per-provider postback signature verification.
//
// Every network signs its S2S postback differently. The original callback only
// understood one scheme (our own HMAC-SHA256 over transactionId+userId+
// userPayout+payoutAmount), so a real network's postback could never verify.
// The scheme is now chosen per provider in /admin/offerwalls (stored in the
// provider's `config` JSON). A provider with no scheme set keeps the original
// HMAC — existing configured providers verify exactly as before.
//
// Modes:
//   HMAC_SHA256   legacy/custom: HMAC-SHA256(secret, txid+userId+userPayout+payoutAmount)
//   TEMPLATE      hash(<template>) where {param} = a postback param, {secret} = the secret
//                 (md5 / sha1 / sha256 / sha512). Covers the "md5(params + secret)" family.
//   HMAC_URL      HMAC(secret, full callback URL with the signature param removed)
//                 (sha1 / sha256). BitLabs-style.
//   SECRET_PARAM  a named param must equal the secret (networks with no hashing).
//                 Weaker — the secret travels in the URL — use only when the
//                 network offers nothing better.
import crypto from "crypto";

import type { SignatureAlgo, SignatureConfig, SignatureMode } from "./signature-presets";
export { SIGNATURE_PRESETS } from "./signature-presets";
export type { SignatureAlgo, SignatureConfig, SignatureMode };

const MODES: SignatureMode[] = ["HMAC_SHA256", "TEMPLATE", "HMAC_URL", "SECRET_PARAM"];
const ALGOS: SignatureAlgo[] = ["md5", "sha1", "sha256", "sha512"];

/** Read the signature settings out of the provider `config` JSON (defaults = legacy HMAC). */
export function parseSignatureConfig(v: unknown): SignatureConfig {
  const c = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const mode = MODES.includes(c.signatureMode as SignatureMode)
    ? (c.signatureMode as SignatureMode)
    : "HMAC_SHA256";
  const algo = ALGOS.includes(c.signatureAlgo as SignatureAlgo)
    ? (c.signatureAlgo as SignatureAlgo)
    : mode === "HMAC_URL"
    ? "sha1"
    : "md5";
  const template = typeof c.signatureTemplate === "string" ? c.signatureTemplate : "";
  const param =
    typeof c.signatureParam === "string" && c.signatureParam.trim()
      ? c.signatureParam.trim()
      : "";
  return { mode, algo, template, param };
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

export interface VerifyInput {
  secret: string;
  /** Full request URL as received. */
  url: URL;
  /** Merged query + body params. */
  params: Record<string, string>;
  /** Values the legacy HMAC covers (already normalized by the callback). */
  legacy: { transactionId: string; userId: string; userPayout: number; payoutAmount: number };
}

/** Pull the provided signature from the configured param, else the usual aliases. */
export function providedSignature(cfg: SignatureConfig, params: Record<string, string>): string {
  if (cfg.param && params[cfg.param]) return params[cfg.param];
  for (const k of ["signature", "sig", "hash", "secure_hash"]) if (params[k]) return params[k];
  return "";
}

/** True when the postback carries a valid signature under the provider's scheme. */
export function verifyPostbackSignature(cfg: SignatureConfig, input: VerifyInput): boolean {
  const { secret, url, params, legacy } = input;
  const provided = providedSignature(cfg, params);
  if (!provided || !secret) return false;

  switch (cfg.mode) {
    case "SECRET_PARAM":
      return safeEqual(provided, secret);
    case "TEMPLATE": {
      if (!cfg.template || !cfg.template.includes("{secret}")) return false; // a hash without the secret proves nothing
      const material = cfg.template.replace(/\{([A-Za-z0-9_.-]+)\}/g, (_m, k: string) =>
        k === "secret" ? secret : params[k] ?? ""
      );
      const expected = crypto.createHash(cfg.algo).update(material).digest("hex");
      return safeEqual(provided.toLowerCase(), expected);
    }
    case "HMAC_URL": {
      const algo = cfg.algo === "sha256" ? "sha256" : "sha1";
      const sigParam = cfg.param || "hash";
      // Strip the signature param from the raw query, preserving everything
      // else byte-for-byte (the network signed the URL as it built it).
      const raw = url.toString();
      const stripped = raw
        .replace(new RegExp(`([?&])${sigParam.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=[^&]*&?`), "$1")
        .replace(/[?&]$/, "");
      const expected = crypto.createHmac(algo, secret).update(stripped).digest("hex");
      return safeEqual(provided.toLowerCase(), expected);
    }
    case "HMAC_SHA256":
    default: {
      const expected = crypto
        .createHmac("sha256", secret)
        .update(`${legacy.transactionId}${legacy.userId}${legacy.userPayout}${legacy.payoutAmount}`)
        .digest("hex");
      return safeEqual(provided.toLowerCase(), expected);
    }
  }
}
