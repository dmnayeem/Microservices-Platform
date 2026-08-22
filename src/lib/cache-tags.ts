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

/**
 * The set of currently-active events, keyed by action type — read on every
 * like/comment/share/purchase to decide whether any progress needs recording.
 *
 * Class 1 rather than class 2 on purpose: a stale *empty* index would silently
 * drop progress, which is the exact failure this whole feature exists to fix.
 * Invalidate after any admin event create/update/delete.
 */
export const EVENTS_ACTIVE_TAG = "events:active";

/**
 * Same contract as `EVENTS_ACTIVE_TAG`, for Missions. Both tag the one shared
 * index in src/lib/goal-progress.ts, so either admin surface can invalidate it.
 * Invalidate after any admin mission create/update/delete.
 */
export const MISSIONS_ACTIVE_TAG = "missions:active";
