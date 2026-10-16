import "server-only";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { fullProfileProgress } from "@/lib/profile-completion";
import { GATE_USER_SELECT } from "@/lib/profile-gate-server";
import { getAmbassadorConfig } from "@/lib/ambassadors-server";
import {
  APPLICATION_REQUIREMENTS_KEY,
  PROGRAMS,
  normalizeRequirementsConfig,
  type ProgramKey,
  type ProgramRequirements,
  type RequirementsConfig,
} from "@/lib/application-requirements";

export async function getRequirementsConfig(): Promise<RequirementsConfig> {
  return normalizeRequirementsConfig(
    await getSetting<unknown>(APPLICATION_REQUIREMENTS_KEY, null).catch(() => null)
  );
}

/**
 * The requirements that actually apply to a program. The ambassador program
 * kept its own minimum level and KYC switch (Admin → Ambassadors) before this
 * center existed; both are honoured — the stricter of the two wins — so the
 * owner's earlier settings keep working.
 */
export async function effectiveRequirements(
  program: ProgramKey,
  cfg?: RequirementsConfig
): Promise<ProgramRequirements> {
  const base = (cfg ?? (await getRequirementsConfig()))[program];
  if (program !== "AMBASSADOR") return base;
  const amb = await getAmbassadorConfig();
  return {
    ...base,
    enabled: base.enabled && amb.enabled,
    minLevel: Math.max(base.minLevel, amb.minLevelToApply),
    kycRequired: base.kycRequired || amb.requireKyc,
  };
}

export interface RequirementCheck {
  key: "enabled" | "level" | "kyc" | "profile" | "accountAge";
  label: string;
  met: boolean;
  /** Where to go to fix it (null when only time fixes it). */
  href: string | null;
}

export interface ProgramEvaluation {
  ok: boolean;
  requirements: ProgramRequirements;
  checks: RequirementCheck[];
  unmet: { label: string; href: string | null }[];
}

const USER_SELECT = {
  ...GATE_USER_SELECT,
  level: true,
  kycStatus: true,
  createdAt: true,
} as const;

type EvalUser = {
  level: number;
  kycStatus: string;
  createdAt: Date;
  _count: { socialAccounts: number };
} & Record<string, unknown>;

function evaluateUser(user: EvalUser | null, req: ProgramRequirements, now = Date.now()): ProgramEvaluation {
  const checks: RequirementCheck[] = [];
  if (!req.enabled) {
    checks.push({ key: "enabled", label: "This program is not taking applications right now", met: false, href: null });
  }
  if (req.minLevel > 0) {
    checks.push({
      key: "level",
      label: `Reach level ${req.minLevel}${user ? ` (you are level ${user.level})` : ""}`,
      met: !!user && user.level >= req.minLevel,
      href: "/tasks",
    });
  }
  if (req.kycRequired) {
    checks.push({ key: "kyc", label: "Verify your identity (KYC)", met: user?.kycStatus === "APPROVED", href: "/kyc" });
  }
  if (req.minProfilePercent > 0) {
    const progress = user
      ? fullProfileProgress(
          { ...(user as object), socialAccountsCount: user._count.socialAccounts },
          req.minProfilePercent
        )
      : null;
    checks.push({
      key: "profile",
      label: `Complete your profile to ${req.minProfilePercent}%${progress ? ` (now ${progress.percentage}%)` : ""}`,
      met: !!progress?.complete,
      href: progress?.missing[0]?.href ?? "/profile",
    });
  }
  if (req.minAccountDays > 0) {
    const days = user ? Math.floor((now - user.createdAt.getTime()) / 86_400_000) : 0;
    const left = Math.max(0, req.minAccountDays - days);
    checks.push({
      key: "accountAge",
      label: `Account at least ${req.minAccountDays} day${req.minAccountDays === 1 ? "" : "s"} old${left > 0 && user ? ` (${left} to go)` : ""}`,
      met: !!user && left === 0,
      href: null,
    });
  }
  const unmet = checks.filter((c) => !c.met).map(({ label, href }) => ({ label, href }));
  return { ok: unmet.length === 0, requirements: req, checks, unmet };
}

/** Does this user meet the admin's requirements for a program? */
export async function evaluateProgram(userId: string, program: ProgramKey): Promise<ProgramEvaluation> {
  const [req, user] = await Promise.all([
    effectiveRequirements(program),
    prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT }),
  ]);
  return evaluateUser(user as unknown as EvalUser | null, req);
}

/** Every program at once, for the /apply hub (one user read, one settings read). */
export async function evaluateAllPrograms(userId: string): Promise<Record<ProgramKey, ProgramEvaluation>> {
  const cfg = await getRequirementsConfig();
  const keys = Object.keys(PROGRAMS) as ProgramKey[];
  const [user, reqs] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT }),
    Promise.all(keys.map((k) => effectiveRequirements(k, cfg))),
  ]);
  const out = {} as Record<ProgramKey, ProgramEvaluation>;
  keys.forEach((k, i) => (out[k] = evaluateUser(user as unknown as EvalUser | null, reqs[i])));
  return out;
}

/** The refusal sentence an apply API returns, or null when the user may go ahead. */
export async function requirementsRefusal(userId: string, program: ProgramKey): Promise<string | null> {
  const r = await evaluateProgram(userId, program);
  if (r.ok) return null;
  const label = PROGRAMS[program].label;
  if (!r.requirements.enabled) {
    return program === "BLUE_BADGE" ? "The blue badge is not available right now." : `${label} is not taking applications right now.`;
  }
  const what = program === "BLUE_BADGE" ? "get the Blue Badge" : `apply for ${label}`;
  return `Before you can ${what}: ${r.unmet.map((u) => u.label).join("; ")}.`;
}
