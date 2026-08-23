import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { registerUser } from "@/lib/auth/services";
import { enforceRateLimit } from "@/lib/rate-limit";

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),
  name: z.string().min(2, "Name must be at least 2 characters"),
  username: z
    .string()
    .trim()
    .regex(
      /^[a-zA-Z0-9._-]{3,30}$/,
      "Username must be 3-30 characters: letters, numbers, dot, underscore or hyphen."
    )
    .optional(),
  referralCode: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, "register", 5, 60_000);
  if (limited) return limited;
  try {
    const body = await request.json();
    const validatedData = registerSchema.parse(body);

    // Anti-fraud: cap accounts per IP (admin-toggleable).
    const { clientIp } = await import("@/lib/rate-limit");
    const { getFraudConfig, accountsOnIp, recordFraudEvent } = await import(
      "@/lib/fraud"
    );
    const ip = clientIp(request);
    const fraud = await getFraudConfig();
    if (fraud.maxUsersPerIp > 0) {
      const existing = await accountsOnIp(ip);
      if (existing >= fraud.maxUsersPerIp) {
        await recordFraudEvent({
          eventType: "MULTIPLE_ACCOUNTS",
          severity: "HIGH",
          ipAddress: ip,
          userAgent: request.headers.get("user-agent"),
          details: { accountsOnIp: existing, cap: fraud.maxUsersPerIp, at: "signup" },
        });
        return NextResponse.json(
          {
            error:
              "Too many accounts have been created from this network. Please try from a different connection.",
          },
          { status: 429 }
        );
      }
    }

    // The IP goes in with the insert now rather than as a follow-up update, so
    // there's no window where a fresh account is invisible to the per-IP cap.
    const result = await registerUser({
      ...validatedData,
      signupIp: ip && ip !== "unknown" ? ip : null,
    });

    // Dev fallback: when SMTP isn't configured we surface the verification link
    // so the developer/tester can finish the flow without a real inbox.
    const isDev = process.env.NODE_ENV !== "production";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const devVerifyUrl =
      isDev && !result.emailSent
        ? `${appUrl}/verify-email?token=${result.verificationToken}`
        : null;

    return NextResponse.json(
      {
        success: true,
        message: result.emailSent
          ? "Registration successful! Please check your email to verify your account."
          : "Registration successful. Email delivery is not configured on this server — use the verification link below to activate the account.",
        userId: result.user.id,
        emailSent: result.emailSent,
        ...(devVerifyUrl ? { devVerifyUrl } : {}),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: error.issues.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      // `provisionUser` throws the CODE "EMAIL_TAKEN"; this compared against the
      // sentence "Email already registered", which nothing throws — so the most
      // common registration failure of all fell through to a generic 500.
      if (
        error.message === "EMAIL_TAKEN" ||
        error.message === "Email already registered"
      ) {
        return NextResponse.json(
          { success: false, error: "That email is already registered." },
          { status: 409 }
        );
      }
      if (error.message === "USERNAME_RESERVED") {
        return NextResponse.json(
          { success: false, error: "That username isn't available." },
          { status: 409 }
        );
      }
      if (error.message === "USERNAME_TAKEN") {
        return NextResponse.json(
          { success: false, error: "Username already taken" },
          { status: 409 }
        );
      }
      if (error.message === "INVALID_USERNAME") {
        return NextResponse.json(
          {
            success: false,
            error:
              "Username must be 3-30 characters: letters, numbers, dot, underscore or hyphen.",
          },
          { status: 400 }
        );
      }
    }

    console.error("Registration error:", error);
    return NextResponse.json(
      { success: false, error: "An error occurred during registration" },
      { status: 500 }
    );
  }
}
