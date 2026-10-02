import { NextRequest, NextResponse } from "next/server";
import { verifyEmail } from "@/lib/auth/services";
import { publicOrigin } from "@/lib/public-origin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Verification token is required" },
        { status: 400 }
      );
    }

    await verifyEmail(token);

    return NextResponse.json({
      success: true,
      message: "Email verified successfully! You can now log in.",
    });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    console.error("Email verification error:", error);
    return NextResponse.json(
      { success: false, error: "An error occurred during verification" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=invalid_token", publicOrigin(request)));
  }

  try {
    await verifyEmail(token);
    return NextResponse.redirect(new URL("/login?verified=true", publicOrigin(request)));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "verification_failed";
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorMessage)}`, publicOrigin(request))
    );
  }
}
