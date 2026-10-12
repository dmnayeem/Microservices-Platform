"use client";

import { WifiOff } from "lucide-react";
import { EmptyState } from "@/components/user/primitives/empty-state";

/**
 * Shown when a task list could not be loaded. The lists used to swallow the
 * error and fall through to "No tasks available", so a dropped connection
 * told the member there was nothing to earn — and nothing to do about it.
 */
export function TaskListError({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={WifiOff}
      title="Couldn't load tasks"
      description="Check your internet connection and try again."
      action={{ label: "Try again", onClick: onRetry }}
    />
  );
}
