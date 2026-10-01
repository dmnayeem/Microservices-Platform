import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resendVerificationEmail } from "@/lib/auth/services";
import { dbRateLimit, enforceDbRateLimit } from "@/lib/rate-limit-db";

const resendSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export async function POST(request: NextRequest) {
  // Every call sends a real email, so an open endpoint was a free mail cannon
  // against any address (and burns the daily send cap).
  const limited = await enforceDbRateLimit(request, "resend-verification", null, 5, 15 * 60_000);
  if (limited) return limited;
  try {
    const body = await request.json();
    const { email } = resendSchema.parse(body);
    // Per ADDRESS too — the limit above is per IP, and IPs rotate.
    const perEmail = await dbRateLimit(`resend-verification:e:${email.toLowerCase()}`, 3, 60 * 60_000);
    if (!perEmail.ok) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${perEmail.retryAfterSec}s.` },
        { status: 429, headers: { "Retry-After": String(perEmail.retryAfterSec) } }
      );
    }

    const result = await resendVerificationEmail(email);

    const isDev = process.env.NODE_ENV !== "production";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const devVerifyUrl =
      isDev && !result.emailSent
        ? `${appUrl}/verify-email?token=${result.verificationToken}`
        : null;

    return NextResponse.json({
      success: true,
      emailSent: result.emailSent,
      message: result.emailSent
        ? "Verification email sent! Please check your inbox."
        : "Email delivery isn't configured on this server — use the link below to verify.",
      ...(devVerifyUrl ? { devVerifyUrl } : {}),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid email address",
        },
        { status: 400 }
      );
    }

    // "User not found" / "Email already verified" told anyone which
    // addresses have accounts. Both get the same neutral answer.
    if (error instanceof Error && /not found|already verified/i.test(error.message)) {
      return NextResponse.json({
        success: true,
        emailSent: true,
        message: "If that account still needs verifying, a new link is on its way.",
      });
    }
    if (error instanceof Error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    console.error("Resend verification error:", error);
    return NextResponse.json(
      { success: false, error: "An error occurred. Please try again." },
      { status: 500 }
    );
  }
}
