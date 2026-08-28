"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { USER_HOME } from "@/lib/routes";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Lock, User, AtSign, Gift, Sparkles, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { registerSchema, type RegisterInput } from "@/lib/validations/auth";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [devVerifyUrl, setDevVerifyUrl] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(true);

  const referralCode = searchParams.get("ref") || "";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      referralCode,
      acceptTerms: false,
    },
  });

  const onSubmit = async (data: RegisterInput) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          name: data.name,
          username: data.username?.trim() ? data.username.trim() : undefined,
          referralCode: data.referralCode,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Registration failed");
      }

      setSuccess(true);
      setEmailSent(result.emailSent !== false);
      if (result.devVerifyUrl) setDevVerifyUrl(result.devVerifyUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-gray-950">
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-emerald-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">
              {emailSent ? "Check your email" : "Account created"}
            </h1>
            <p className="text-gray-400">
              {emailSent
                ? "We've sent a verification link to your email address. Please click the link to verify your account."
                : "Email delivery is not configured on this server. Use the link below to verify the account."}
            </p>
          </div>
          {devVerifyUrl && (
            <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-left space-y-2">
              <p className="text-emerald-300 text-sm font-semibold">
                Dev verification link
              </p>
              <a
                href={devVerifyUrl}
                className="inline-block text-xs text-emerald-300 break-all underline hover:text-emerald-200"
              >
                {devVerifyUrl}
              </a>
            </div>
          )}
          <div className="pt-4 space-y-2">
            {devVerifyUrl && (
              <Button
                variant="primary"
                onClick={() => router.push(devVerifyUrl)}
                fullWidth
              >
                Verify now →
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => router.push("/login")}
              fullWidth
            >
              Back to Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

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
            Create your account
          </h1>
          <p className="text-gray-400">
            Start earning money today
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Register Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Input
            label="Full Name"
            type="text"
            placeholder="Enter your name"
            leftIcon={<User className="h-5 w-5" />}
            error={errors.name?.message}
            {...register("name")}
          />

          <Input
            label="Username (optional)"
            type="text"
            placeholder="Choose a username"
            leftIcon={<AtSign className="h-5 w-5" />}
            hint="Leave blank and we'll generate one for you. Used in your profile link."
            error={errors.username?.message}
            {...register("username")}
          />

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
            placeholder="Create a password"
            leftIcon={<Lock className="h-5 w-5" />}
            hint="At least 8 characters with uppercase, lowercase, and number"
            error={errors.password?.message}
            {...register("password")}
          />

          <Input
            label="Confirm Password"
            type="password"
            placeholder="Confirm your password"
            leftIcon={<Lock className="h-5 w-5" />}
            error={errors.confirmPassword?.message}
            {...register("confirmPassword")}
          />

          <Input
            label="Referral Code (Optional)"
            type="text"
            placeholder="Enter referral code"
            leftIcon={<Gift className="h-5 w-5" />}
            error={errors.referralCode?.message}
            {...register("referralCode")}
          />

          <Checkbox
            label={
              <>
                I agree to the{" "}
                <Link href="/terms" className="text-indigo-400 hover:underline">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="text-indigo-400 hover:underline">
                  Privacy Policy
                </Link>
              </>
            }
            error={errors.acceptTerms?.message}
            {...register("acceptTerms")}
          />

          <Button type="submit" fullWidth size="lg" isLoading={isLoading}>
            Create Account
          </Button>
        </form>

        {/* Google sign-up. This page is where every referral link lands
            (/register?ref=CODE), so leaving Google out of it meant anyone who
            preferred Google had to detour via /login — losing the referral code
            on the way. The middleware stores the code in a cookie, so the
            attribution now survives the trip to Google and back. */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-800" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-gray-950 text-gray-500">
              or sign up with
            </span>
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          fullWidth
          size="lg"
          onClick={() => signIn("google", { callbackUrl: USER_HOME })}
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

        {referralCode && (
          <p className="text-center text-xs text-emerald-400">
            Invite code <span className="font-bold">{referralCode}</span> applied
            — it works with Google sign-up too.
          </p>
        )}

        {/* Benefits */}
        <div className="p-4 rounded-lg bg-gray-900 border border-gray-800">
          <h3 className="text-sm font-medium text-white mb-3">
            Start earning with EarnGPT:
          </h3>
          <ul className="space-y-2 text-sm text-gray-400">
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-400" />
              Complete tasks and earn points
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-400" />
              Invite friends and earn commissions
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-400" />
              Withdraw to PayPal, bank, crypto & more
            </li>
          </ul>
        </div>

        {/* Login Link */}
        <p className="text-center text-gray-400">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

// useSearchParams() requires a Suspense boundary for the static build shell.
export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
