import { CheckCircle2, XCircle, Circle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  coerceQuizAnswers,
  coerceQuizQuestions,
  scoreQuiz,
  NO_CORRECT_ANSWER,
} from "@/lib/quiz-shape";
import type { PanelSubmission, PanelTask } from "./types";

interface Props {
  submission: PanelSubmission;
  task: PanelTask;
}

export function QuizProofPanel({ submission, task }: Props) {
  // Both columns are `Json?` and hold more than one shape — see quiz-shape.ts.
  // This used to cast straight to an array, and a double-encoded (string) row
  // sailed past the `.length === 0` guard below into `.reduce`.
  const questions = coerceQuizQuestions(task.questions);
  const userAnswers = coerceQuizAnswers(submission.answers);
  const score = submission.score;

  if (!questions) {
    return (
      <div className="rounded-lg bg-gray-950 border border-gray-800 p-3 text-xs text-gray-500">
        No questions configured on this quiz.
      </div>
    );
  }

  const correctCount = scoreQuiz(questions, userAnswers);

  const scoreTone =
    score === null
      ? "bg-gray-800 border-gray-700 text-gray-400"
      : score >= 80
      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
      : score >= 50
      ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
      : "bg-red-500/10 border-red-500/30 text-red-300";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-bold border tabular-nums",
            scoreTone
          )}
        >
          <HelpCircle className="w-4 h-4" />
          {score !== null ? `${score}%` : "—"}
        </span>
        <span className="text-xs text-gray-400 tabular-nums">
          {correctCount} / {questions.length} correct
        </span>
      </div>

      <ol className="space-y-2">
        {questions.map((q, qIdx) => {
          const userPick = userAnswers[qIdx] ?? null;
          const isCorrect =
            userPick !== null && userPick === q.correctAnswer;
          const noAnswer = userPick === null;
          // A question stored without any correct-answer key would otherwise
          // paint every option red and read as "the user got it wrong".
          const unscored = q.correctAnswer === NO_CORRECT_ANSWER;
          return (
            <li
              key={qIdx}
              className={cn(
                "rounded-lg border p-3 space-y-2",
                noAnswer || unscored
                  ? "bg-gray-950 border-gray-800"
                  : isCorrect
                  ? "bg-emerald-500/5 border-emerald-500/30"
                  : "bg-red-500/5 border-red-500/30"
              )}
            >
              <p className="text-sm font-semibold text-white flex items-start gap-2">
                <span className="text-xs text-gray-500 tabular-nums mt-0.5 shrink-0">
                  Q{qIdx + 1}.
                </span>
                <span className="flex-1">{q.question}</span>
              </p>
              <div className="space-y-1 ml-7">
                {q.options.map((opt, oIdx) => {
                  const isUserPick = userPick === oIdx;
                  const isCorrectOpt = !unscored && q.correctAnswer === oIdx;
                  return (
                    <div
                      key={oIdx}
                      className={cn(
                        "flex items-center gap-2 text-xs rounded-md px-2 py-1.5",
                        isCorrectOpt
                          ? "bg-emerald-500/10 text-emerald-200"
                          : isUserPick
                          ? "bg-red-500/10 text-red-200"
                          : "text-gray-400"
                      )}
                    >
                      {isCorrectOpt ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : isUserPick ? (
                        <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                      )}
                      <span className="flex-1">{opt}</span>
                      {isUserPick && (
                        <span className="text-[10px] uppercase tracking-wider font-bold opacity-80">
                          User pick
                        </span>
                      )}
                      {isCorrectOpt && (
                        <span className="text-[10px] uppercase tracking-wider font-bold opacity-80">
                          Correct
                        </span>
                      )}
                    </div>
                  );
                })}
                {noAnswer && (
                  <p className="text-[11px] text-gray-500 italic">
                    User didn&apos;t answer this question
                  </p>
                )}
                {unscored && (
                  <p className="text-[11px] text-amber-400/80 italic">
                    No correct answer is configured on this question — it
                    can&apos;t be scored.
                  </p>
                )}
              </div>
              {q.explanation && (
                <p className="text-[11px] text-gray-500 italic ml-7">
                  💡 {q.explanation}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
