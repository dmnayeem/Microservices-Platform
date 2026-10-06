"use client";

import { ErrorCard } from "@/components/error-card";

export default function TutorError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <ErrorCard
      error={error}
      retry={retry}
      message="This tutor page failed to load. Try again."
      homeHref="/dashboard"
      homeLabel="Dashboard"
    />
  );
}
