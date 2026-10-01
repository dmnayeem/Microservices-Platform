import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestPasswordReset } from "@/lib/auth/services";
import { enforceRateLimit } from "@/lib/rate-limit";
import { dbRateLimit } from "@/lib/rate-limit-db";

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, "forgot-password", 5, 60_000);
  if (limited) return limited;
  try {
    const body = await request.json();
    const { email } = forgotPasswordSchema.parse(body);

    // Per ADDRESS as well as per IP: the IP limiter is in-memory and IPs
    // rotate, so without this anyone could fill a victim's inbox with reset
    // mails. Over the limit we answer exactly as usual and just send nothing,
    // so the response still says nothing about whether the account exists.
    const perEmail = await dbRateLimit(`forgot-password:e:${email.toLowerCase()}`, 3, 60 * 60_000);
    if (perEmail.ok) await requestPasswordReset(email);

    // Always return success to prevent email enumeration
    return NextResponse.json({
      success: true,
      message: "If an account exists with this email, you will receive a password reset link.",
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

    console.error("Forgot password error:", error);
    return NextResponse.json(
      { success: false, error: "An error occurred. Please try again." },
      { status: 500 }
    );
  }
}
