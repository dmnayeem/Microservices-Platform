// Client-safe (no crypto import): the postback signature scheme types and the
// known-network presets the admin provider form offers. Verification lives in
// postback-signature.ts (server only).

export type SignatureMode = "HMAC_SHA256" | "TEMPLATE" | "HMAC_URL" | "SECRET_PARAM";
export type SignatureAlgo = "md5" | "sha1" | "sha256" | "sha512";

export interface SignatureConfig {
  mode: SignatureMode;
  algo: SignatureAlgo;
  /** TEMPLATE mode: e.g. "{trans_id}-{secret}". */
  template: string;
  /** Request param carrying the signature (or the secret, in SECRET_PARAM mode). */
  param: string;
}

/**
 * Known network schemes. Admin picks one as a starting point in the provider
 * form; the fields stay editable because networks let each account rename
 * their postback macros. Check the network's postback docs for your account.
 */
export const SIGNATURE_PRESETS: Record<string, Partial<SignatureConfig> & { label: string }> = {
  CUSTOM_HMAC: { label: "Custom HMAC-SHA256 (default)", mode: "HMAC_SHA256", param: "signature" },
  // CPX Research: hash = md5("{trans_id}-{secret}")
  CPX_RESEARCH: { label: "CPX Research — md5(trans_id-secret)", mode: "TEMPLATE", algo: "md5", template: "{trans_id}-{secret}", param: "hash" },
  // BitLabs: HMAC-SHA1 of the full callback URL (without &hash=) with the app secret
  BITLABS: { label: "BitLabs — HMAC-SHA1 of the URL", mode: "HMAC_URL", algo: "sha1", param: "hash" },
  // Lootably: sha256(userID + ip + revenue + currencyReward + secret)
  LOOTABLY: { label: "Lootably — sha256(userID+ip+revenue+currencyReward+secret)", mode: "TEMPLATE", algo: "sha256", template: "{userID}{ip}{revenue}{currencyReward}{secret}", param: "hash" },
  // AdGate-style "md5 of params + secret" — edit the template to your macros
  ADGATE_MEDIA: { label: "AdGate-style — md5(tx_id+user_id+points+secret)", mode: "TEMPLATE", algo: "md5", template: "{tx_id}{user_id}{points}{secret}", param: "hash" },
  SECRET_PARAM: { label: "Secret key in a URL param (no hash)", mode: "SECRET_PARAM", param: "secret" },
};
