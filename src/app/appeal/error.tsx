"use client";

import { ErrorCard } from "@/components/error-card";

export default function AppealError({
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
      message="We couldn't load your appeal. Try again."
      homeHref="/"
      homeLabel="Home"
      fullScreen
    />
  );
}
