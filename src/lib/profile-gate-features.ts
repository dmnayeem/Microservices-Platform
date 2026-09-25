/**
 * What the profile gate can lock. Client-safe (no prisma), so the admin
 * settings screen can list the choices without a round trip; the server module
 * `profile-gate-server.ts` re-exports these and enforces them.
 */
export const GATE_FEATURES = [
  { key: "tasks", label: "Tasks (every task type)" },
  { key: "missions", label: "Daily missions & missions" },
  { key: "quizzes", label: "Quiz games" },
  { key: "offerwalls", label: "Offerwalls" },
  { key: "selling", label: "Selling on the marketplace" },
  { key: "withdrawals", label: "Withdrawals" },
] as const;
export type GateFeature = (typeof GATE_FEATURES)[number]["key"];

/** What an admin who only flips the master switch gets — the original behaviour. */
export const DEFAULT_GATE_FEATURES: GateFeature[] = ["tasks", "missions"];
export type GateMode = "ESSENTIALS" | "FULL";

/** The admin's profile percentage, kept to a sensible 10–100 whole number. */
export function clampGatePercent(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(100, Math.max(10, n)) : 100;
}
