"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle, XCircle, Loader2, Sparkles, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const email = searchParams.get("email");

  const [status, setStatus] = useState<"loading" | "success" | "error" | "resend">(
    token ? "loading" : "resend"
  );
  const [error, setError] = useState<string | null>(null);
  const [resendEmail, setResendEmail] = useState(email || "");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [devVerifyUrl, setDevVerifyUrl] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      verifyEmail();
    }
    // verifyEmail is stable for a given `token`; intentional fire-once-per-token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const verifyEmail = async () => {
    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Verification failed");
      }

      setStatus("success");
      setTimeout(() => {
        router.push("/login?verified=true");
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setStatus("error");
    }
  };

  const handleResend = async () => {
    if (!resendEmail) return;

    setResendLoading(true);
    setResendSuccess(false);
    setError(null);

    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to resend email");
      }

      setResendSuccess(true);
      if (result.devVerifyUrl) setDevVerifyUrl(result.devVerifyUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend email");
    } finally {
      setResendLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-(--app-page)">
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-(--app-cta)/10 flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-(--app-accent-ink) animate-spin" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">
              Verifying your email...
            </h1>
            <p className="text-(--app-ink-3)">
              Please wait while we verify your email address.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-(--app-page)">
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-emerald-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">
              Email Verified!
            </h1>
            <p className="text-(--app-ink-3)">
              Your email has been successfully verified. Redirecting to login...
            </p>
          </div>
          <div className="pt-4">
            <Link href="/login">
              <Button variant="primary" fullWidth>
                Go to Login
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-(--app-page)">
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-red-500/10 flex items-center justify-center">
            <XCircle className="w-10 h-10 text-red-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">
              Verification Failed
            </h1>
            <p className="text-(--app-ink-3)">
              {error || "The verification link is invalid or has expired."}
            </p>
          </div>
          <div className="pt-4 space-y-3">
            <Button
              variant="primary"
              fullWidth
              onClick={() => setStatus("resend")}
            >
              Resend Verification Email
            </Button>
            <Link href="/login">
              <Button variant="secondary" fullWidth>
                Back to Login
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Resend form
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-(--app-page)">
      <div className="w-full max-w-md space-y-8">
        {/* Logo & Header */}
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold bg-linear-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              EarnGPT
            </span>
          </Link>
          <h1 className="text-2xl font-bold text-white">
            Verify your email
          </h1>
          <p className="text-(--app-ink-3)">
            Enter your email to resend the verification link.
          </p>
        </div>

        {/* Success Message */}
        {resendSuccess && (
          <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm space-y-2">
            <p>
              {devVerifyUrl
                ? "Email delivery is not configured on this server. Click the link below to verify."
                : "Verification email sent! Please check your inbox."}
            </p>
            {devVerifyUrl && (
              <a
                href={devVerifyUrl}
                className="inline-block px-3 py-1.5 rounded-md bg-emerald-500 text-white font-semibold hover:bg-emerald-600 break-all"
              >
                Verify now →
              </a>
            )}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Form */}
        <div className="space-y-5">
          <Input
            label="Email"
            type="email"
            placeholder="Enter your email"
            leftIcon={<Mail className="h-5 w-5" />}
            value={resendEmail}
            onChange={(e) => setResendEmail(e.target.value)}
          />

          <Button
            fullWidth
            size="lg"
            isLoading={resendLoading}
            onClick={handleResend}
            disabled={!resendEmail}
          >
            Resend Verification Email
          </Button>
        </div>

        {/* Login Link */}
        <p className="text-center text-(--app-ink-3)">
          Already verified?{" "}
          <Link
            href="/login"
            className="text-(--app-accent-ink) hover:text-(--app-accent-ink) font-medium transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-(--app-page)">
        <div className="animate-spin w-8 h-8 border-2 border-(--app-accent-edge) border-t-transparent rounded-full" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
