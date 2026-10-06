"use client";

import { ErrorCard } from "@/components/error-card";

export default function AuthError({
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
      message="We couldn't load this page. Try again."
      homeHref="/"
      homeLabel="Home"
      fullScreen
    />
  );
}
