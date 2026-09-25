/**
 * Checks that a broadcast reaches its audience, resumes, and respects the cap.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.script.json scripts/verify-broadcasts.ts
 *
 * The properties worth asserting are the ones the old fire-and-forget send got
 * wrong, and every one of them was invisible from the admin screen:
 *
 *   - a send that stops halfway resumes where it stopped and notifies NOBODY
 *     twice (the old one had no record of who it had already written to);
 *   - "scheduled" means scheduled — the previous version wrote an audit line
 *     saying so and nothing, anywhere, ever sent it;
 *   - a geographic filter selects exactly the people it says it does;
 *   - pause actually stops the next batch.
 *
 * In-app only: this script never sends an email, so it cannot spend the daily
 * allowance or put anything in a real person's inbox. It notifies real users,
 * then deletes every notification it created.
 */
import { prisma } from "./_q";
import {
  createBroadcast,
  deliverBroadcast,
  estimateAudience,
  emailBudget,
  runBroadcastSweep,
} from "../src/lib/broadcast";
import { readPayload, notificationStyle } from "../src/lib/notification-styles";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${detail ? ` — ${detail}` : ""}`);
}

const MARK = "verify-broadcasts — temporary";

async function cleanup(ids: string[]) {
  await prisma.notification.deleteMany({ where: { title: MARK } });
  if (ids.length > 0) {
    await prisma.broadcast.deleteMany({ where: { id: { in: ids } } });
  }
}

async function main() {
  const made: string[] = [];
  try {
    const admin = await prisma.user.findFirst({
      where: { role: { in: ["SUPER_ADMIN", "ADMIN"] } },
      select: { id: true },
    });
    if (!admin) {
      console.log("No admin account to send as.");
      process.exit(1);
    }

    console.log("Targeting");
    const some = await prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: { id: "asc" },
      take: 7,
      select: { id: true },
    });
    if (some.length < 3) {
      console.log("Need at least 3 active users to test with.");
      process.exit(1);
    }
    const specific = {
      targetKind: "SPECIFIC" as const,
      criteria: null,
      userIds: some.map((u) => u.id),
      packages: [] as string[],
    };
    const specificCount = await estimateAudience(specific);
    check(
      "a specific list estimates exactly that many",
      specificCount === some.length,
      `${specificCount} vs ${some.length}`
    );

    // A country nobody is in must select nobody — a filter that silently
    // widens is how a message meant for one district reaches everyone.
    const nowhere = await estimateAudience({
      targetKind: "SEGMENT",
      criteria: { countries: ["ZZ"] },
      userIds: [],
      packages: [],
    });
    check("an impossible country selects nobody", nowhere === 0, `${nowhere}`);

    const everyone = await prisma.user.count({ where: { status: "ACTIVE" } });
    const all = await estimateAudience({
      targetKind: "ALL",
      criteria: null,
      userIds: [],
      packages: [],
    });
    check("ALL means every active user", all === everyone, `${all} vs ${everyone}`);

    console.log("\nDelivery resumes instead of repeating");
    const b = await createBroadcast({
      createdById: admin.id,
      title: MARK,
      message: "Created by verify-broadcasts. Deleted at the end.",
      channels: { inApp: true, push: false, email: false },
      ...specific,
    });
    made.push(b.id);

    // A pass with no time budget must do nothing AND lose nothing. That is the
    // contract the whole design rests on: a function killed at its ceiling is
    // not a failed send, it is a send that has not got as far yet.
    const none = await deliverBroadcast(b.id, { maxMs: 0 });
    check(
      "a pass with no time left does nothing",
      none.enumerated === 0 && none.inApp === 0 && !none.finished
    );

    const second = await deliverBroadcast(b.id, { maxMs: 15_000 });
    check("a real pass finishes it", second.finished, JSON.stringify(second));

    const rows = await prisma.notification.count({
      where: { title: MARK, userId: { in: specific.userIds } },
    });
    check(
      "exactly one notification per recipient",
      rows === some.length,
      `${rows} for ${some.length} recipients`
    );

    // Now the case that actually mattered: a crash after some recipients were
    // written and before the rest were. Three of them are rolled back to
    // "not yet delivered" — rows and notifications both — and the next pass
    // must restore exactly those three and disturb nobody else.
    const rollback = await prisma.broadcastRecipient.findMany({
      where: { broadcastId: b.id },
      take: 3,
      select: { id: true, userId: true },
    });
    await prisma.notification.deleteMany({
      where: { title: MARK, userId: { in: rollback.map((r) => r.userId) } },
    });
    await prisma.broadcastRecipient.updateMany({
      where: { id: { in: rollback.map((r) => r.id) } },
      data: { inAppAt: null },
    });
    await prisma.broadcast.update({
      where: { id: b.id },
      data: { status: "SENDING", finishedAt: null, inAppSent: some.length - 3 },
    });

    const resumed = await deliverBroadcast(b.id, { maxMs: 15_000 });
    check("the resumed pass wrote exactly the missing three", resumed.inApp === 3, `${resumed.inApp}`);
    const afterResume = await prisma.notification.count({
      where: { title: MARK, userId: { in: specific.userIds } },
    });
    check(
      "and the total is back to one each — nobody was notified twice",
      afterResume === some.length,
      `${afterResume} for ${some.length}`
    );

    const third = await deliverBroadcast(b.id, { maxMs: 5_000 });
    const after = await prisma.notification.count({ where: { title: MARK } });
    check("running it again sends nothing more", after === rows, `${after} vs ${rows}`);
    check("and it reports no new work", third.inApp === 0);

    const done = await prisma.broadcast.findUnique({
      where: { id: b.id },
      select: { status: true, totalRecipients: true, inAppSent: true, audienceReady: true },
    });
    check("status is DONE", done?.status === "DONE", done?.status ?? "");
    check("the audience is marked complete", done?.audienceReady === true);
    check(
      "the counters match reality",
      done?.inAppSent === some.length && done?.totalRecipients === some.length,
      `${done?.inAppSent}/${done?.totalRecipients} vs ${some.length}`
    );

    console.log("\nScheduling is real, not a label");
    const later = new Date(Date.now() + 60 * 60_000);
    const sched = await createBroadcast({
      createdById: admin.id,
      title: MARK,
      message: "Scheduled.",
      channels: { inApp: true, push: false, email: false },
      targetKind: "SPECIFIC",
      userIds: [some[0].id],
      packages: [],
      criteria: null,
      scheduledFor: later,
    });
    made.push(sched.id);
    check("it is SCHEDULED, not sent", sched.status === "SCHEDULED", sched.status);

    await runBroadcastSweep({ maxMs: 5_000 });
    const stillWaiting = await prisma.broadcast.findUnique({
      where: { id: sched.id },
      select: { status: true },
    });
    check("a sweep before its time leaves it alone", stillWaiting?.status === "SCHEDULED");

    // Move it into the past; the sweep must now start it.
    await prisma.broadcast.update({
      where: { id: sched.id },
      data: { scheduledFor: new Date(Date.now() - 1000) },
    });
    await runBroadcastSweep({ maxMs: 20_000 });
    const started = await prisma.broadcast.findUnique({
      where: { id: sched.id },
      select: { status: true, inAppSent: true },
    });
    check(
      "once due, the sweep really sends it",
      started?.status === "DONE" && started.inAppSent === 1,
      `${started?.status} / ${started?.inAppSent}`
    );

    console.log("\nPause stops the next batch");
    const p = await createBroadcast({
      createdById: admin.id,
      title: MARK,
      message: "Pause test.",
      channels: { inApp: true, push: false, email: false },
      ...specific,
    });
    made.push(p.id);
    await prisma.broadcast.update({ where: { id: p.id }, data: { status: "PAUSED" } });
    const paused = await deliverBroadcast(p.id, { maxMs: 5_000 });
    check(
      "a paused broadcast delivers nothing",
      paused.inApp === 0 && paused.enumerated === 0
    );
    const sweep = await runBroadcastSweep({ maxMs: 5_000 });
    check(
      "and the sweep does not pick it up either",
      !sweep.passes.some((x) => x.broadcastId === p.id)
    );

    console.log("\nThe template reaches the notification the user opens");
    const styled = await createBroadcast({
      createdById: admin.id,
      title: MARK,
      message: "Styled.",
      channels: { inApp: true, push: false, email: false },
      style: "URGENT",
      kicker: "Ends in 3 hours",
      imageUrl: "/api/media/marketplace-previews/example.jpg",
      actionUrl: "/wallet",
      actionLabel: "Open wallet",
      ...specific,
    });
    made.push(styled.id);
    await deliverBroadcast(styled.id, { maxMs: 15_000 });
    const one = await prisma.notification.findFirst({
      where: { title: MARK, userId: specific.userIds[0] },
      orderBy: { createdAt: "desc" },
      select: { data: true },
    });
    const payload = readPayload(one?.data);
    check("the template id arrives", payload.style === "URGENT", payload.style ?? "none");
    check("the kicker arrives", payload.kicker === "Ends in 3 hours", payload.kicker ?? "none");
    check("the image arrives", !!payload.imageUrl, payload.imageUrl ?? "none");
    check(
      "the button label arrives",
      payload.actionLabel === "Open wallet",
      payload.actionLabel ?? "none"
    );
    check("the link arrives", payload.actionUrl === "/wallet", payload.actionUrl ?? "none");
    // An unknown template must not break the row — it renders plain instead.
    check(
      "an unknown template falls back to Normal rather than throwing",
      notificationStyle("NOT_A_STYLE").id === "PLAIN"
    );

    console.log("\nA service notice reaches people who switched marketing off");
    // Somebody who turned off "email notifications" turned off OFFERS. A
    // marketing broadcast must skip them; a security or payment notice must
    // not, because registering for an account is consent to hear about it.
    const guinea = some[0];
    const before = await prisma.user.findUnique({
      where: { id: guinea.id },
      select: { emailNotifications: true },
    });
    await prisma.user.update({
      where: { id: guinea.id },
      data: { emailNotifications: false },
    });
    try {
      const marketing = await createBroadcast({
        createdById: admin.id,
        title: MARK,
        message: "Marketing.",
        channels: { inApp: true, push: false, email: true },
        targetKind: "SPECIFIC",
        userIds: [guinea.id],
        packages: [],
        criteria: null,
      });
      made.push(marketing.id);
      // `maxEmails: 0` lets enumeration run without a single message being
      // sent, so this asserts who WOULD be emailed without emailing anyone.
      await deliverBroadcast(marketing.id, { maxMs: 8_000, maxEmails: 0 });
      const mRow = await prisma.broadcastRecipient.findFirst({
        where: { broadcastId: marketing.id, userId: guinea.id },
        select: { email: true },
      });
      check("a marketing broadcast will not email an opted-out user", mRow?.email === null);

      const notice = await createBroadcast({
        createdById: admin.id,
        title: MARK,
        message: "Service notice.",
        channels: { inApp: true, push: false, email: true },
        important: true,
        targetKind: "SPECIFIC",
        userIds: [guinea.id],
        packages: [],
        criteria: null,
      });
      made.push(notice.id);
      await deliverBroadcast(notice.id, { maxMs: 8_000, maxEmails: 0 });
      const nRow = await prisma.broadcastRecipient.findFirst({
        where: { broadcastId: notice.id, userId: guinea.id },
        select: { email: true },
      });
      check("an important notice still reaches them", !!nRow?.email, nRow?.email ?? "skipped");
      check("it is flagged important", notice.important === true);
    } finally {
      // The opt-out belongs to a real person; it goes back exactly as it was
      // whatever happens above.
      await prisma.user.update({
        where: { id: guinea.id },
        data: { emailNotifications: before?.emailNotifications ?? true },
      });
    }

    console.log("\nThe daily email budget reads back");
    const bud = await emailBudget();
    check("a cap is configured", Number.isFinite(bud.cap), `${bud.cap}/day`);
    check("today's usage is a number", Number.isFinite(bud.usedToday), `${bud.usedToday} used`);
    check(
      "remaining is consistent with the cap",
      bud.cap === 0
        ? bud.remainingToday === Infinity
        : bud.remainingToday === bud.cap - bud.usedToday,
      `${bud.remainingToday}`
    );
  } finally {
    await cleanup(made);
    const left = await prisma.notification.count({ where: { title: MARK } });
    check("every test notification was removed", left === 0, `${left} left`);
  }

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
