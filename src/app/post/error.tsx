"use client";

import { ErrorCard } from "@/components/error-card";

export default function PostError({
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
      message="This post failed to load. Try again."
      homeHref="/"
      homeLabel="Home"
      fullScreen
    />
  );
}
