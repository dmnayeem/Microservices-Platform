import { ADMIN_ROLES, type UserRole } from "@/lib/rbac";

/**
 * Who counts as "staff", and the one filter that keeps them off public rankings.
 *
 * The owner's rule: nobody who works on the platform — super-admin, admin,
 * moderator, finance, content, support, marketing, ad-manager — appears in Top
 * Earners or on `/leaderboard`. Staff accounts are seeded, test money moves
 * through them, and they run the tasks they are testing, so ranking them
 * against real users is meaningless.
 *
 * It was not a cosmetic problem. Measured on live data before this shipped
 * (`scripts/report-staff-in-leaderboard.ts`):
 *
 *   money board  — 4 of the visible top 5 were staff, and #1 was an admin at
 *                  $70.79 against $1.22 for the best real user (58x)
 *   XP board     — all 5 of the top 5 were staff; four of them had earned $0
 *                  and ranked purely on seeded XP
 *   every board  — 11 of 40 rows were staff
 *   participants — "40 players" counted 11 staff accounts
 *
 * And it was not only cosmetic in the money sense either: the prize reset in
 * `api/admin/leaderboard/reset` pays real balances to the top N, so an admin
 * sitting at #1 would have been paid.
 *
 * Derived from `ADMIN_ROLES` rather than re-listing the roles, so a role added
 * to the admin panel later is excluded from the boards automatically instead of
 * quietly appearing on them. TUTOR and AGENCY are deliberately NOT staff: a
 * tutor sells courses and an agency buys ads — both are customers, and both
 * earn their standing the same way everyone else does.
 */
export const STAFF_ROLES: UserRole[] = [...ADMIN_ROLES];

const STAFF_SET = new Set<string>(STAFF_ROLES);

/** True when this role belongs to someone employed on the platform. */
export function isStaffRole(role: string | null | undefined): boolean {
  return !!role && STAFF_SET.has(role);
}

/**
 * Drop-in `where` fragment for any query that feeds a public ranking.
 *
 * Spread it into the query rather than filtering in JS after the fact: a
 * `take: 5` that pulls five rows and then removes the staff among them returns
 * three names, not five.
 */
export const NON_STAFF_WHERE = {
  role: { notIn: STAFF_ROLES },
} as const;
