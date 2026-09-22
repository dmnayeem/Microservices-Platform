/**
 * Every way a user can earn XP, written down.
 *
 * The owner asked what raises a level. Nothing could answer that: XP is
 * awarded from thirteen places scattered across routes and libraries, and the
 * only way to find out was to read them all. This is that list, kept beside
 * the code that grants it.
 *
 * It is a REFERENCE, not a config. Changing an entry here changes nothing —
 * the `amount` column says where each figure actually comes from, and several
 * of them are already admin-editable in their own screens. Pretending
 * otherwise would be worse than not listing them: a table that looks editable
 * and is not is how this platform ended up with 44 dead settings.
 *
 * `scripts/verify-level-sync.ts` counts the places that award XP and fails if
 * this list falls behind them.
 */

export interface XpSource {
  /** What the user did. */
  label: string;
  /** Where the award happens, so an admin can hand it to a developer. */
  where: string;
  /** How the figure is decided, and who can change it. */
  amount: string;
  /** Whether an admin can change the figure today, and where. */
  configurable: string;
}

export const XP_SOURCES: XpSource[] = [
  {
    label: "Task submission approved",
    where: "api/tasks/[id]/submit",
    amount: "the task's own XP reward",
    configurable: "Per task, in the task editor",
  },
  {
    label: "Submission approved by an admin",
    where: "api/admin/submissions/[id]",
    amount: "the task's own XP reward",
    configurable: "Per task, in the task editor",
  },
  {
    label: "Social proof re-checked and approved",
    where: "lib/social-recheck",
    amount: "the task's own XP reward",
    configurable: "Per task, in the task editor",
  },
  {
    label: "Social earning ratio reward",
    where: "lib/social-earning",
    amount: "from the social-earning settings",
    configurable: "Settings → Social earning",
  },
  {
    label: "Achievement claimed",
    where: "api/achievements/[id]/claim",
    amount: "the achievement's XP reward",
    configurable: "On this page",
  },
  {
    label: "Daily reward claimed",
    where: "api/daily-reward",
    amount: "the day's configured reward",
    configurable: "Settings → Daily reward",
  },
  {
    label: "Daily mission claimed",
    where: "api/daily-mission/claim",
    amount: "the mission's XP reward",
    configurable: "Admin → Missions",
  },
  {
    label: "Mission claimed (library path)",
    where: "lib/missions",
    amount: "the mission's XP reward",
    configurable: "Admin → Missions",
  },
  {
    label: "Quiz passed (quiz task)",
    where: "api/tasks/quiz",
    amount: "the task's own XP reward",
    configurable: "Per task, in the task editor",
  },
  {
    label: "Quiz attempt scored",
    where: "api/quizzes/[id]/attempt",
    amount: "the quiz's XP reward",
    configurable: "Admin → Quizzes",
  },
  {
    label: "Solo reward claimed",
    where: "api/solo-reward/claim",
    amount: "a fixed figure in the route",
    configurable: "Not yet — needs a developer",
  },
  {
    label: "Board completed",
    where: "api/tasks/boards/[id]/claim",
    amount: "the board's XP reward",
    configurable: "Admin → Boards",
  },
  {
    label: "Event tier reached",
    where: "lib/events",
    amount: "the tier's XP reward",
    configurable: "Admin → Events",
  },
  {
    label: "Event completed",
    where: "lib/events",
    amount: "the event's XP reward",
    configurable: "Admin → Events",
  },
];
