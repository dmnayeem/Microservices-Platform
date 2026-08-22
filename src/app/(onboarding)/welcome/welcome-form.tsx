"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight, Loader2 } from "lucide-react";
import { UsernameField } from "@/components/user/profile/profile-ui";
import { Button } from "@/components/ui/button";
import { finishOnboarding, skipOnboarding } from "./actions";

const ERROR_TEXT: Record<string, string> = {
  AUTH: "Your session expired — please sign in again.",
  INVALID: "Use 3-30 letters, numbers, dot, underscore or hyphen.",
  RESERVED: "That handle is reserved. Please pick another.",
  TAKEN: "Someone just took that handle. Try another.",
};

/**
 * First-login handle picker.
 *
 * Google users never see the register form, so they never chose a @handle —
 * they get a generated one like `johndoe418923` and nothing ever tells them.
 * This is the one place that does.
 */
export function WelcomeForm({
  currentUsername,
  name,
  alreadyDone,
}: {
  currentUsername: string | null;
  name: string | null;
  alreadyDone: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentUsername ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Loop-breaker: the token said "not onboarded" but the database says
  // otherwise (stale claim + cleared cookie). Silently finish and move on
  // rather than bouncing the user between /welcome and /social forever.
  useEffect(() => {
    if (!alreadyDone) return;
    void skipOnboarding().then(() => router.replace("/social"));
  }, [alreadyDone, router]);

  const submit = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        // refresh() so the layout picks up the re-signed session before we move.
        router.replace("/social");
        router.refresh();
        return;
      }
      setError(ERROR_TEXT[res.error ?? ""] ?? "Something went wrong.");
    });
  };

  if (alreadyDone) {
    return (
      <div className="min-h-screen grid place-items-center bg-gray-950">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gray-950">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 grid place-items-center mx-auto">
            <Sparkles className="w-6 h-6 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">
            Welcome{name ? `, ${name.split(" ")[0]}` : ""}!
          </h1>
          <p className="text-sm text-gray-400">
            Pick your @handle — it&apos;s your profile link and how people
            mention you.
          </p>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
          <UsernameField
            value={value}
            onChange={setValue}
            currentUsername={currentUsername}
          />

          {error && <p className="text-xs text-red-400">{error}</p>}

          <Button
            fullWidth
            size="lg"
            isLoading={pending}
            onClick={() => submit(() => finishOnboarding(value))}
            rightIcon={!pending ? <ArrowRight className="w-4 h-4" /> : undefined}
          >
            Continue
          </Button>

          <button
            type="button"
            disabled={pending}
            onClick={() => submit(() => skipOnboarding())}
            className="w-full text-center text-xs text-gray-500 hover:text-gray-300 disabled:opacity-50"
          >
            Skip for now — keep{" "}
            <span className="font-mono text-gray-400">
              @{currentUsername ?? "your handle"}
            </span>
          </button>
          <p className="text-[11px] text-gray-600 text-center">
            You can change your @handle any time in Profile → Personal.
          </p>
        </div>
      </div>
    </div>
  );
}
