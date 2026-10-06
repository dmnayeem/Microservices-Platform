"use client";

import { ErrorCard } from "@/components/error-card";

export default function CertPrintError({
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
      message="This certificate failed to load. Try again."
      homeHref="/dashboard"
      homeLabel="Dashboard"
      fullScreen
    />
  );
}
