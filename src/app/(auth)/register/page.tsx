"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
