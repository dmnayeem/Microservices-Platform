import { NextRequest, NextResponse } from "next/server";
import { isBotUserAgent } from "@/lib/bot-detect";
import { z } from "zod";
import { registerUser } from "@/lib/auth/services";
import { enforceRateLimit } from "@/lib/rate-limit";
import { validatePassword } from "@/lib/password-policy";

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  // Length + character classes are enforced against the admin Security policy
  // after parsing (see below) — Zod cannot await a setting. This keeps only the
  // floor no policy may go under.
  password: z.string().min(1, "Password is required"),
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

    // Admin Security policy (password_min_length + require_strong_passwords).
    const pwError = await validatePassword(validatedData.password);
    if (pwError) {
      return NextResponse.json({ error: pwError }, { status: 400 });
    }

    // Anti-fraud: cap accounts per IP (admin-toggleable).
    const { clientIp } = await import("@/lib/rate-limit");
    const { recordFraudEvent } = await import("@/lib/fraud");
    const ip = clientIp(request);

    // An automated signup, recorded before the account exists.
    //
    // The per-IP cap below catches someone making many accounts; it says
    // nothing about ONE account made by a script, which is the case the owner
    // asked to be able to see. A self-identifying client — curl, a request
    // library, headless automation, or no user agent at all — is not a person
    // filling in a form, and an account created that way is worth knowing
    // about before it starts earning.
    //
    // Recorded, not blocked. This test is a string match on a header the
    // client chooses, so refusing on it would turn one spoofed header into a
    // locked-out real user, while a determined bot simply sends a browser
    // agent and walks through. The event puts it in front of an admin, and the
    // trust and spot-check gates still stand between the account and a payout.
    const signupUa = request.headers.get("user-agent");
    if (isBotUserAgent(signupUa)) {
      await recordFraudEvent({
        eventType: "BOT_SIGNUP",
        severity: "MEDIUM",
        ipAddress: ip,
        userAgent: signupUa,
        details: {
          at: "signup",
          reason: signupUa ? "automated user agent" : "no user agent sent",
          email: validatedData.email,
        },
      });
    }
    // Device and IP limits (src/lib/device.ts). The device is the real
    // multi-account signal; an IP is shared by a whole home or office WiFi,
    // so by default it only flags for review — see `ipLimitAction`.
    const { readDevice, checkSignup, recordDevice } = await import("@/lib/device");
    const seen = { ...(await readDevice()), ip: ip && ip !== "unknown" ? ip : null };
    const verdict = await checkSignup(seen, validatedData.email);
    if (!verdict.ok) {
      return NextResponse.json({ error: verdict.error }, { status: 429 });
    }

    // The IP goes in with the insert now rather than as a follow-up update, so
    // there's no window where a fresh account is invisible to the per-IP cap.
    const result = await registerUser({
      ...validatedData,
      signupIp: ip && ip !== "unknown" ? ip : null,
    });
    // The device the account was made on — counted by the per-device limit.
    await recordDevice(result.user.id, seen);

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
