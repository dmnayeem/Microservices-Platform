/**
 * Cache tags for `unstable_cache` + `revalidateTag`.
 *
 * **Which caching layer to use is a decision, not a preference.** The rule for
 * this codebase:
 *
 * 1. **Shared + admin-mutated** (pricing, settings, banners, landing content) →
 *    `unstable_cache` with a tag from this file, invalidated with
 *    `revalidateTag` in the admin write handler. Vercel's Data Cache is shared
 *    across instances, so invalidation is deterministic. The in-process Maps
 *    used elsewhere (`invalidateSettingsCache`, `invalidateUserFeatures`) only
 *    clear the ONE instance that handled the admin's request.
 *
 * 2. **Shared + user-generated, seconds-tolerant** (feed pool, trending,
 *    leaderboards) → Accelerate `cacheStrategy` with a short ttl. Accept the
 *    staleness window; don't build invalidation for it.
 *
 * 3. **Per-user money / limits / eligibility** (balances, submissions, quiz
 *    attempts, lottery tickets, claim state, subscription) → **never cached, at
 *    either layer.** Display staleness is a UX cost; decision staleness is a
 *    money bug. `safeRead`'s docstring in `src/lib/prisma.ts` states the same
 *    rule for degradation — it governs caching too.
 */

/** Active package/pricing rows. Invalidate after any admin package write. */
export const PACKAGES_TAG = "packages";
