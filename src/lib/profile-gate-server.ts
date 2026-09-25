import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUiToggles } from "@/lib/ui-toggles-server";
import { getSetting } from "@/lib/system-settings";
import {
  fullProfileProgress,
  requiredProfileProgress,
  UNLOCK_REQUIRED,
  type RequiredProgress,
} from "@/lib/profile-completion";

/**
 * The profile gate: things a user cannot do until their profile is complete.
 *
 * Three admin settings, all on Settings → Toggles:
 *   ui.require_profile_completion   master switch (off by default)
 *   profile_gate.mode               ESSENTIALS — the 7 core fields
 *                                   FULL       — the whole 100% profile ring
 *   profile_gate.features           which features lock (see GATE_FEATURES)
 *
 * The gate is only as good as its weakest entry point. It used to be checked by
 * the /tasks page and ONE start route — article tasks, quiz tasks, board
 * claims, mission claims, quiz games and offerwalls all had their own routes
 * and none of them asked, so a locked user could earn through any of them.
 * Every route that lets a user earn now calls `profileGateResponse`.
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

export interface ProfileGateState {
  /** Admin master switch is ON and this feature is one of the locked ones. */
  required: boolean;
  complete: boolean;
  /** required && !complete. */
  locked: boolean;
  mode: GateMode;
  progress: RequiredProgress;
}

const OPEN_PROGRESS: RequiredProgress = {
  done: UNLOCK_REQUIRED.length,
  total: UNLOCK_REQUIRED.length,
  percentage: 100,
  complete: true,
  missing: [],
};
const open = (mode: GateMode): ProfileGateState => ({
  required: false,
  complete: true,
  locked: false,
  mode,
  progress: OPEN_PROGRESS,
});

export async function getGateConfig(): Promise<{ on: boolean; mode: GateMode; features: GateFeature[] }> {
  const [{ requireProfileCompletion }, mode, features] = await Promise.all([
    getUiToggles(),
    getSetting<string>("profile_gate.mode", "ESSENTIALS"),
    getSetting<string[]>("profile_gate.features", DEFAULT_GATE_FEATURES),
  ]);
  const valid = new Set<string>(GATE_FEATURES.map((f) => f.key));
  return {
    on: !!requireProfileCompletion,
    mode: mode === "FULL" ? "FULL" : "ESSENTIALS",
    features: (Array.isArray(features) ? features : DEFAULT_GATE_FEATURES).filter((f): f is GateFeature =>
      valid.has(f)
    ),
  };
}

/**
 * Resolve the gate for one user and one feature.
 *
 * With no feature it answers "is this user's profile complete by the admin's
 * chosen standard" — for the dashboard banner — and `required` means the switch
 * is on at all. Short-circuits with no user query when the switch is off.
 */
export async function getProfileGateState(
  userId: string,
  feature?: GateFeature
): Promise<ProfileGateState> {
  const cfg = await getGateConfig();
  if (!cfg.on) return open(cfg.mode);
  if (feature && !cfg.features.includes(feature)) return open(cfg.mode);

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        avatar: true,
        coverPhoto: true,
        firstName: true,
        lastName: true,
        bio: true,
        gender: true,
        dateOfBirth: true,
        nidNumber: true,
        emailVerified: true,
        phone: true,
        phoneVerified: true,
        country: true,
        city: true,
        street: true,
        postalCode: true,
        tags: true,
        _count: { select: { socialAccounts: true } },
      },
    });
  } catch {
    // Fail-open on a DB blip — a lock screen for everyone because a query
    // timed out is worse than one request that slips through.
    return open(cfg.mode);
  }
  if (!user) return open(cfg.mode);

  const socialAccountsCount = (user as unknown as { _count: { socialAccounts: number } })._count.socialAccounts;
  const progress =
    cfg.mode === "FULL"
      ? fullProfileProgress({ ...user, socialAccountsCount })
      : requiredProfileProgress(user);

  return {
    required: true,
    complete: progress.complete,
    locked: !progress.complete,
    mode: cfg.mode,
    progress,
  };
}

const FEATURE_NOUN: Record<GateFeature, string> = {
  tasks: "start tasks",
  missions: "claim mission rewards",
  quizzes: "play quiz games",
  offerwalls: "use offerwalls",
  selling: "sell on the marketplace",
  withdrawals: "withdraw",
};

/**
 * For API routes: `null` when the user may go ahead, otherwise a 403 carrying
 * the sentence and the checklist, so any client can show what is missing.
 */
export async function profileGateResponse(userId: string, feature: GateFeature): Promise<NextResponse | null> {
  const gate = await getProfileGateState(userId, feature);
  if (!gate.locked) return null;
  const { done, total, percentage, missing } = gate.progress;
  return NextResponse.json(
    {
      error:
        gate.mode === "FULL"
          ? `Complete your profile to 100% to ${FEATURE_NOUN[feature]} — you are at ${percentage}%.`
          : `Complete your profile to ${FEATURE_NOUN[feature]} — ${done} of ${total} essentials done.`,
      code: "PROFILE_INCOMPLETE",
      profileGate: { done, total, percentage, missing: missing.map((m) => ({ label: m.label, href: m.href })) },
    },
    { status: 403 }
  );
}
