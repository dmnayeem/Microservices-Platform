import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestPasswordReset } from "@/lib/auth/services";
import { enforceRateLimit } from "@/lib/rate-limit";

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, "forgot-password", 5, 60_000);
  if (limited) return limited;
  try {
    const body = await request.json();
    const { email } = forgotPasswordSchema.parse(body);

    await requestPasswordReset(email);

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
