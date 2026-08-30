/**
 * How a quiz's repeat cadence reads in a sentence.
 *
 * Deliberately its own module with NO imports. The period maths in
 * `quiz-period.ts` needs the user's timezone, which comes from `user-day.ts`,
 * which is `server-only` — so a client component importing the label from there
 * drags the whole server chain into the browser bundle and the page dies with
 * "Ecmascript file had an error: import 'server-only'". The admin quiz form is
 * a client component and did exactly that.
 *
 * Pure text belongs where both sides can reach it.
 */

export type QuizRepeat = "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY";

/**
 * Spell out the combined effect of the cadence and the attempt allowance.
 *
 * "3 attempts" plus "DAILY" is not self-explanatory — the point of the sentence
 * is to say that BOTH the tries and the reward come back, which is the whole
 * difference between a repeating quiz and a one-shot one.
 */
export function describeQuizRepeat(
  repeat: QuizRepeat,
  maxAttempts: number
): string {
  const tries = `${maxAttempts} ${maxAttempts === 1 ? "try" : "tries"}`;
  switch (repeat) {
    case "DAILY":
      return `Comes back every day — ${tries} per day, and it can be earned again each day.`;
    case "WEEKLY":
      return `Comes back every week — ${tries} per week, and it can be earned again each week.`;
    case "MONTHLY":
      return `Comes back every month — ${tries} per month, and it can be earned again each month.`;
    default:
      return `One time only — ${tries} in total, and the reward is paid once.`;
  }
}
