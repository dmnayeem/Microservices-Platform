import { localDayKey, localStartOfDayUtc } from "@/lib/user-day";

/**
 * "The same quiz comes back every day" — what that actually means.
 *
 * A repeating quiz needs three things to move together, or it pays wrong:
 *
 *   1. the attempt allowance resets each period,
 *   2. the reward can be earned again in the next period,
 *   3. "have you already passed this?" is asked about THIS period, not ever.
 *
 * All three hang off one period key, which is why they live in one file. Get
 * them out of step and a daily quiz either pays once and then never again
 * (users think it is broken), or pays every attempt (a points printer).
 *
 * `ONCE` returns an empty key on purpose: the reward reference for a one-shot
 * quiz stays byte-identical to what it has always been
 * (`quiz_reward_<userId>_<quizId>`), so nobody can re-claim a quiz they were
 * already paid for. The unique `(userId, reference)` index is what enforces it.
 *
 * Periods follow the USER's local day, not UTC — the same rule the daily reward
 * and the streak already use, so "today" means the same thing everywhere in the
 * app regardless of where someone is.
 */

// Re-exported so server callers need only one import. The definitions live in
// a dependency-free module because the admin form is a client component and
// this file reaches `user-day`, which is `server-only`.
export {
  describeQuizRepeat,
  type QuizRepeat,
} from "@/lib/quiz-repeat-label";
import type { QuizRepeat } from "@/lib/quiz-repeat-label";

/** ISO week number (1–53) for a local date, Monday-based. */
function isoWeek(y: number, m: number, d: number): { year: number; week: number } {
  // Thursday of the current week decides the ISO year.
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = (date.getUTCDay() + 6) % 7; // Mon = 0
  date.setUTCDate(date.getUTCDate() - day + 3);
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week =
    1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return { year: isoYear, week };
}

/**
 * The key identifying the current period for a user.
 *
 * Empty string for ONCE — see the note above; that is the whole reason the
 * pre-existing reward references keep working untouched.
 */
export function quizPeriodKey(
  repeat: QuizRepeat,
  tz: string,
  now: Date = new Date()
): string {
  if (repeat === "ONCE") return "";
  const day = localDayKey(tz, now); // YYYY-MM-DD in the user's zone
  if (repeat === "DAILY") return day;
  const [y, m, d] = day.split("-").map(Number);
  if (repeat === "MONTHLY") return `${y}-${String(m).padStart(2, "0")}`;
  const { year, week } = isoWeek(y, m, d);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/**
 * When the current period began, as a UTC instant — the lower bound for
 * "attempts used so far" and "have they passed it yet".
 *
 * `null` for ONCE, which means "count everything, forever".
 */
export function quizPeriodStart(
  repeat: QuizRepeat,
  tz: string,
  now: Date = new Date()
): Date | null {
  if (repeat === "ONCE") return null;
  const startOfToday = localStartOfDayUtc(tz, now);
  if (repeat === "DAILY") return startOfToday;
  if (repeat === "WEEKLY") {
    // Back up to Monday, then take that day's local midnight.
    const [y, m, d] = localDayKey(tz, now).split("-").map(Number);
    const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Mon = 0
    return localStartOfDayUtc(tz, new Date(now.getTime() - dow * 86_400_000));
  }
  // MONTHLY — local midnight on the 1st. Only the day-of-month is needed here;
  // stepping back that many days lands inside the same month in every zone.
  const dayOfMonth = Number(localDayKey(tz, now).split("-")[2]);
  return localStartOfDayUtc(
    tz,
    new Date(now.getTime() - (dayOfMonth - 1) * 86_400_000)
  );
}
