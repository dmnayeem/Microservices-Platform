import { prisma } from "./_q";

/**
 * Is this thing ready to open to the public?
 *
 * Not a code review — a checklist of the things that are only wrong once real
 * users arrive: a payout route with no payment method behind it, a wallet
 * liability that is mostly seeded test money, a settings row nobody filled in,
 * an env var that is fine in dev and fatal in production.
 *
 * Read-only. Findings are split into BLOCKER (do not launch), WARN (launch, but
 * know this), and note.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/audit-launch-readiness.ts
 */

let blockers = 0;
let warnings = 0;
function ok(s: string) {
  console.log(`  ok       ${s}`);
}
function blocker(s: string, detail?: string) {
  blockers++;
  console.log(`  BLOCKER  ${s}${detail ? `\n           ${detail}` : ""}`);
}
function warn(s: string, detail?: string) {
  warnings++;
  console.log(`  WARN     ${s}${detail ? `\n           ${detail}` : ""}`);
}
function note(s: string) {
  console.log(`  note     ${s}`);
}
const n = (v: unknown) => Number(v ?? 0);

async function main() {
  console.log("\n=== Launch readiness ===\n");

  /* ── Environment ── */
  console.log("1. Environment");
  const env = process.env;
  const dbUrl = env.DATABASE_URL ?? "";
  if (!dbUrl) blocker("DATABASE_URL is not set");
  else if (dbUrl.startsWith("prisma+postgres://") || dbUrl.startsWith("prisma://"))
    ok("DATABASE_URL is an Accelerate URL, so every cacheStrategy actually caches");
  else
    warn(
      "DATABASE_URL is a DIRECT postgres connection",
      "every `cacheStrategy` in the app becomes a no-op — fine locally, expensive in production"
    );

  const required: Array<[string, string]> = [
    ["NEXTAUTH_SECRET", "sessions cannot be signed without it"],
    ["NEXTAUTH_URL", "OAuth callbacks and email links point at the wrong host without it"],
  ];
  for (const [k, why] of required) {
    if (env[k]) ok(`${k} is set`);
    else blocker(`${k} is not set`, why);
  }

  const optional: Array<[string, string]> = [
    ["SENTRY_DSN", "errors in production go nowhere — nobody finds out what broke"],
    ["NEXT_PUBLIC_SENTRY_DSN", "browser-side errors are not reported"],
    ["GEMINI_API_KEY", "AI quiz generation and social recipes stop working"],
    ["RESEND_API_KEY", "no transactional email (verification, password reset, payout notices)"],
  ];
  for (const [k, why] of optional) {
    if (env[k]) ok(`${k} is set`);
    else warn(`${k} is not set`, why);
  }

  // Loaded once and reused by the payout section and the settings section —
  // both ask the same table what a human has (or has not) configured.
  const settingRows = new Map(
    (
      (await prisma.systemSetting.findMany({
        select: { key: true, value: true },
      })) as unknown as Array<{ key: string; value: unknown }>
    ).map((r) => [r.key, r.value])
  );

  /* ── Money that must not be phantom ── */
  console.log("\n2. Wallet liability");
  const STAFF = [
    "SUPER_ADMIN", "ADMIN", "FINANCE_ADMIN", "CONTENT_ADMIN",
    "SUPPORT_ADMIN", "MARKETING_ADMIN", "MODERATOR", "AD_MANAGER",
  ];
  const [staffAgg, userAgg] = await Promise.all([
    prisma.user.aggregate({
      where: { role: { in: STAFF as never } },
      _sum: { pointsBalance: true, cashBalance: true },
    }),
    prisma.user.aggregate({
      where: { role: { notIn: STAFF as never } },
      _sum: { pointsBalance: true, cashBalance: true },
    }),
  ]);
  const staffPts = n(staffAgg._sum.pointsBalance);
  const userPts = n(userAgg._sum.pointsBalance);
  const totalPts = staffPts + userPts;
  console.log(
    `  points on the books: staff ${staffPts.toLocaleString()} · real users ${userPts.toLocaleString()}`
  );
  console.log(
    `  cash on the books:   staff $${n(staffAgg._sum.cashBalance).toFixed(2)} · real users $${n(userAgg._sum.cashBalance).toFixed(2)}`
  );
  if (totalPts > 0 && staffPts / totalPts > 0.5)
    warn(
      `${Math.round((staffPts / totalPts) * 100)}% of the points on the books belong to staff accounts`,
      "these were seeded, not earned — zero them before launch or every liability figure in the finance console is wrong"
    );
  else ok("staff balances are not the bulk of the platform's liability");

  /* ── Can anyone actually get paid? ── */
  console.log("\n3. Payouts");
  // Payout rules live in SystemSetting (see lib/withdrawal.ts), not in a
  // PaymentMethod table — there isn't one. Reading them from the same place the
  // withdrawal page does is the only way to be sure this reflects what a user
  // sees.
  const setting = <T,>(key: string, fallback: T): T => {
    const raw = settingRows.get(key);
    if (raw === undefined || raw === null) return fallback;
    return raw as T;
  };
  const minW = Number(setting<number>("min_withdrawal", 5));
  const maxW = Number(setting<number>("max_withdrawal", 1000));
  const feePct = Number(setting<number>("withdrawal_fee_percent", 5));
  const allowW = setting<boolean>("allow_withdrawals", true);
  console.log(
    `  min $${minW} · max $${maxW} · fee ${feePct}% · withdrawals ${allowW === false ? "OFF" : "ON"}`
  );
  if (allowW === false)
    blocker("withdrawals are switched off", "users can earn but never take money out");
  else ok("withdrawals are enabled");
  if (maxW > 0 && minW > maxW)
    blocker(
      "the withdrawal minimum is above the maximum",
      `min $${minW} > max $${maxW} — every request is rejected by one rule or the other`
    );
  else ok("the withdrawal min/max range is coherent");
  if (feePct < 0 || feePct > 100)
    blocker(`the withdrawal fee is ${feePct}%`, "a fee outside 0–100% produces nonsense payouts");
  else ok(`the withdrawal fee (${feePct}%) is in range`);

  const savedMethods = await prisma.userPaymentMethod.count();
  if (savedMethods === 0)
    note("no user has saved a payout account yet (expected before launch)");
  else ok(`${savedMethods} saved payout account(s) on file`);

  const pendingWd = await prisma.withdrawal.count({ where: { status: "PENDING" } });
  if (pendingWd > 0) note(`${pendingWd} withdrawal(s) are waiting for a decision`);

  /* ── The review queue ── */
  console.log("\n4. The review queue");
  const pending = await prisma.taskSubmission.count({
    where: { status: "PENDING", submittedAt: { not: null } },
  });
  const opened = await prisma.taskSubmission.count({
    where: { status: "PENDING", submittedAt: null },
  });
  console.log(`  ${pending} submitted and awaiting review · ${opened} opened but never submitted`);
  if (pending > 25)
    warn(
      `${pending} submissions are queued for manual review`,
      "clear the backlog before launch, or the first real users join a queue that is already days deep"
    );
  else ok("the review queue is short enough to clear");

  /* ── Content people will land on ── */
  console.log("\n5. What a new user lands on");
  const [liveTasks, activePkgs, activeAds, banners] = await Promise.all([
    prisma.task.count({ where: { status: "ACTIVE", hidden: false } }),
    prisma.package.count({ where: { isActive: true } }),
    prisma.ad.count({ where: { status: "ACTIVE" } }),
    prisma.banner.count({ where: { isActive: true } }),
  ]);
  console.log(
    `  ${liveTasks} live tasks · ${activePkgs} active plans · ${activeAds} active ads · ${banners} active banners`
  );
  if (liveTasks === 0) blocker("there are no live tasks — a new user has nothing to do");
  else ok(`${liveTasks} live tasks to choose from`);
  if (activePkgs === 0) blocker("no plan is active — nobody can upgrade or be assigned a tier");
  else ok(`${activePkgs} plan(s) are active`);

  // The free default is a plan, but it is not something anyone can BUY. Without
  // a paid tier there is no subscription revenue, and every plan-gated
  // feature — reward multipliers, lower withdrawal minimums, fee discounts —
  // sits permanently at its free-tier value.
  const paid = (await prisma.package.findMany({
    where: { isActive: true, isDefault: false },
    select: { slug: true, priceMonthly: true },
  })) as unknown as Array<{ slug: string; priceMonthly: unknown }>;
  if (paid.length === 0)
    warn(
      "there is no paid plan — only the free default exists",
      "nobody can upgrade, so there is no subscription revenue and every plan perk is stuck at free-tier values"
    );
  else
    ok(
      `${paid.length} paid tier(s): ${paid.map((p) => `${p.slug} $${n(p.priceMonthly)}`).join(", ")}`
    );

  // Prize eligibility names package slugs; slugs with no package behind them
  // simply match nobody, which is fine until the day someone wonders why a
  // tier never wins.
  const eligibleRaw = settingRows.get("lb_eligible_packages");
  if (Array.isArray(eligibleRaw)) {
    const existing = new Set(
      (
        (await prisma.package.findMany({ select: { slug: true } })) as unknown as Array<{
          slug: string;
        }>
      ).map((p) => p.slug.toUpperCase())
    );
    const ghosts = (eligibleRaw as unknown[])
      .map((x) => String(x).toUpperCase())
      .filter((s) => !existing.has(s));
    if (ghosts.length)
      note(
        `leaderboard prize eligibility lists ${ghosts.join(", ")}, which match no package — harmless, but they will never win anything`
      );
    else ok("every package named in the leaderboard prize eligibility list exists");
  }

  /* ── Settings the owner has to fill in ── */
  console.log("\n6. Settings that need a human");
  const byKey = settingRows;
  const looksEmpty = (v: unknown) =>
    v === null ||
    v === undefined ||
    v === "" ||
    (typeof v === "object" && v !== null && Object.keys(v as object).length === 0);

  const humanKeys: Array<[string, string]> = [
    ["invoice.business_name", "invoices and receipts go out with no business name on them"],
    ["invoice.business_address", "invoices carry no address"],
    ["invoice.vat_bin", "invoices carry no VAT/BIN number"],
    ["ads.adsense_client", "no AdSense publisher id — Google ads cannot serve"],
  ];
  for (const [k, why] of humanKeys) {
    if (!byKey.has(k) || looksEmpty(byKey.get(k))) warn(`${k} is empty`, why);
    else ok(`${k} is filled in`);
  }

  console.log(
    `\n${blockers} blocker(s), ${warnings} warning(s).\n${blockers === 0 ? "Nothing here blocks a launch." : "Fix the blockers before opening to the public."}\n`
  );
  process.exit(0);
}
main();
