/**
 * What the profile gate can lock. Client-safe (no prisma), so the admin
 * settings screen can list the choices without a round trip; the server module
 * `profile-gate-server.ts` re-exports these and enforces them.
 */
export const GATE_FEATURES = [
  { key: "tasks", label: "Tasks (every task type — also locks CPA offers and offerwalls)" },
  { key: "missions", label: "Daily missions & missions" },
  { key: "quizzes", label: "Quiz games" },
  { key: "offerwalls", label: "Offerwalls" },
  { key: "cpa", label: "CPA offers" },
  { key: "selling", label: "Selling on the marketplace" },
  { key: "withdrawals", label: "Withdrawals" },
] as const;
export type GateFeature = (typeof GATE_FEATURES)[number]["key"];

/** What an admin who only flips the master switch gets — the original behaviour. */
export const DEFAULT_GATE_FEATURES: GateFeature[] = ["tasks", "missions"];

/**
 * Surfaces that ARE tasks to the user, so locking "tasks" locks them too
 * (owner, 2026-09-29: no task of any kind without a complete profile). They
 * can still be locked on their own with "tasks" off. Nothing stored changes:
 * a saved list of ["tasks", "missions"] now also covers these.
 */
export const COVERED_BY_TASKS: readonly GateFeature[] = ["offerwalls", "cpa"];

/** Is `feature` locked by this list of locked features? */
export function gateCovers(features: readonly string[], feature: GateFeature): boolean {
  return (
    features.includes(feature) ||
    (COVERED_BY_TASKS.includes(feature) && features.includes("tasks"))
  );
}
export type GateMode = "ESSENTIALS" | "FULL";

/** The admin's profile percentage, kept to a sensible 10–100 whole number. */
export function clampGatePercent(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(100, Math.max(10, n)) : 100;
}
