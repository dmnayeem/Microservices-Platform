import { getSetting } from "@/lib/system-settings";
import {
  TEST_USERS_SETTING_KEY,
  normalizeTestUserIds,
  withoutUsers,
  type ExcludeOpts,
} from "./test-users-core";

export {
  MAX_TEST_USERS,
  TEST_USERS_SETTING_KEY,
  normalizeTestUserIds,
  testUsersSql,
  withoutUsers,
  type ExcludeOpts,
} from "./test-users-core";

/**
 * Finance test users.
 *
 * Admins test the platform with ordinary user accounts. Their deposits, task
 * points, withdrawals, ad funding and purchases are real rows in real tables,
 * so every finance figure counted them — the books were never 100% real.
 *
 * A finance admin marks those accounts here, and every finance report leaves
 * them out. NOTHING else changes: their wallet, profile, leaderboards and the
 * operational queues (a test withdrawal still has to be processed) treat them
 * as normal users. This is a reporting filter, not an account state, which is
 * why it lives in one SystemSetting rather than a column.
 *
 * Reads are the cached `getSetting` (in-memory ~45s + Accelerate edge), so the
 * exclusion costs no extra query on a warm instance.
 */

export async function getFinanceTestUserIds(): Promise<string[]> {
  return normalizeTestUserIds(await getSetting<unknown>(TEST_USERS_SETTING_KEY, []));
}

/** `withoutUsers` with the current test-user list (cached read). */
export async function excludeTestUsers<W extends object>(
  where: NoInfer<W> | undefined,
  fields: string | string[] = "userId",
  opts: ExcludeOpts = {}
): Promise<W> {
  return withoutUsers(where, await getFinanceTestUserIds(), fields, opts);
}
