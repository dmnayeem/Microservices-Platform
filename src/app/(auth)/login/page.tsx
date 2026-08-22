"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn, getSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { ADMIN_ROLE_STRINGS } from "@/lib/rbac";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** This address is a Google-only account — show the button, not an error. */
  const [oauthOnly, setOauthOnly] = useState(false);
  const [needsOtp, setNeedsOtp] = useState(false);
  const [otp, setOtp] = useState("");
  // Email-verification recovery: when a valid-password account isn't verified,
  // offer a resend of the verification link.
  const [showResend, setShowResend] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);
  const [devVerifyUrl, setDevVerifyUrl] = useState<string | null>(null);

  const verified = searchParams.get("verified") === "true";
  const callbackUrl = searchParams.get("callbackUrl") || "/social";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    setIsLoading(true);
    setError(null);
    setShowResend(false);
    setResendNote(null);
    setDevVerifyUrl(null);

    try {
      // Pre-check the exact reason first — Auth.js v5 masks authorize errors as
      // a generic "CredentialsSignin", so signIn() alone can't tell us whether
      // the password was wrong vs. the email is unverified vs. 2FA is needed.
      const checkRes = await fetch("/api/auth/login-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          otp: needsOtp ? otp : undefined,
        }),
      });
      const { reason } = (await checkRes.json().catch(() => ({}))) as {
        reason?: string;
      };

      if (reason === "EMAIL_NOT_VERIFIED") {
        setPendingEmail(data.email);
        setShowResend(true);
        setError("Please verify your email before logging in.");
        return;
      }
      if (reason === "ACCOUNT_DISABLED") {
        setError("Your account has been disabled. Please contact support.");
        return;
      }
      if (reason === "TWO_FACTOR_REQUIRED") {
        setNeedsOtp(true);
        setError("Enter the 6-digit code from your authenticator app.");
        return;
      }
      if (reason === "INVALID_2FA") {
        setNeedsOtp(true);
        setError("Invalid 2FA code. Try again.");
        return;
      }
      if (reason !== "OK") {
        setError("Invalid email or password");
        return;
      }

      // Reason is OK — the sign-in will succeed.
      const result = await signIn("credentials", {
        email: data.email,
        password: data.password,
        otp: needsOtp ? otp : "",
        redirect: false,
      });

      if (result?.error) {
        // Shouldn't normally happen after an OK pre-check (e.g. a race), but
        // fail gracefully.
        setError("Invalid email or password");
        return;
      }

      // Get the session to check user role for redirect
      const session = await getSession();
      const userRole = session?.user?.role;

      // Redirect based on role - all admin roles go to admin dashboard
      if (
        userRole &&
        ADMIN_ROLE_STRINGS.includes(
          userRole as typeof ADMIN_ROLE_STRINGS[number]
        )
      ) {
        router.push("/admin");
      } else {
        router.push(callbackUrl);
      }
      router.refresh();
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!pendingEmail) return;
    setResending(true);
    setResendNote(null);
    setDevVerifyUrl(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmail }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        devVerifyUrl?: string;
        error?: string;
      };
      if (!res.ok) {
        setResendNote(data.error ?? "Couldn't send the verification email.");
        return;
      }
      setResendNote(data.message ?? "Verification email sent.");
      if (data.devVerifyUrl) setDevVerifyUrl(data.devVerifyUrl);
    } catch {
      setResendNote("Couldn't send the verification email. Try again.");
    } finally {
      setResending(false);
    }
  };

  const handleGoogleLogin = () => {
    setOauthOnly(false);
    signIn("google", { callbackUrl });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-gray-950">
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
            Welcome back
          </h1>
          <p className="text-gray-400">
            Sign in to continue earning
          </p>
        </div>

        {/* Success Message */}
        {verified && (
          <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
            Email verified successfully! You can now log in.
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* A Google-only account has no password to get wrong — say so instead
            of "invalid email or password", which reads as a broken login. */}
        {oauthOnly && (
          <div className="p-4 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-sm space-y-2">
            <p className="text-indigo-300 font-semibold">
              This account signs in with Google.
            </p>
            <p className="text-gray-400 text-xs">
              You never set a password here. Use the Google button below — or
              choose &quot;Forgot password&quot; to add one.
            </p>
            <button
              type="button"
              onClick={handleGoogleLogin}
              className="text-indigo-400 hover:text-indigo-300 text-xs font-bold underline"
            >
              Continue with Google
            </button>
          </div>
        )}

        {/* Resend verification (shown when a valid account isn't verified) */}
        {showResend && (
          <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm space-y-2">
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resending}
              className="font-semibold text-amber-300 hover:text-amber-200 disabled:opacity-50"
            >
              {resending ? "Sending…" : "Resend verification email"}
            </button>
            {resendNote && <p className="text-amber-200/80">{resendNote}</p>}
            {devVerifyUrl && (
              <a
                href={devVerifyUrl}
                className="block break-all text-indigo-400 hover:text-indigo-300 underline"
              >
                {devVerifyUrl}
              </a>
            )}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Input
            label="Email"
            type="email"
            placeholder="Enter your email"
            leftIcon={<Mail className="h-5 w-5" />}
            error={errors.email?.message}
            {...register("email")}
          />

          <Input
            label="Password"
            type="password"
            placeholder="Enter your password"
            leftIcon={<Lock className="h-5 w-5" />}
            error={errors.password?.message}
            {...register("password")}
          />

          {needsOtp && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Two-Factor Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-center tracking-[0.4em] font-mono placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Forgot password?
            </Link>
          </div>

          <Button type="submit" fullWidth size="lg" isLoading={isLoading}>
            {needsOtp ? "Verify & Sign In" : "Sign In"}
          </Button>
        </form>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-800" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-gray-950 text-gray-500">
              or continue with
            </span>
          </div>
        </div>

        {/* Social Login */}
        <Button
          type="button"
          variant="secondary"
          fullWidth
          size="lg"
          onClick={handleGoogleLogin}
          leftIcon={
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          }
        >
          Continue with Google
        </Button>

        {/* Register Link */}
        <p className="text-center text-gray-400">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

// useSearchParams() requires a Suspense boundary for the static build shell.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
