import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { evaluateLogin } from "@/lib/auth/services";
import { enforceRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6), // match authorize()'s min length so a short
  // password reports INVALID here exactly as the real sign-in would.
  otp: z.string().optional(),
});

// POST /api/auth/login-check — pre-flight the credential check so the login
// page can show the REAL reason a sign-in would fail (Auth.js v5 hides thrown
// authorize errors from the client). Returns only a coarse reason code, never
// any user data. `INVALID` covers both wrong-password and unknown-email.
export async function POST(request: NextRequest) {
  // Throttle brute-force of passwords/OTP against this credential oracle.
  const limited = enforceRateLimit(request, "login-check", 10, 60_000);
  if (limited) return limited;
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ reason: "INVALID" });
    }

    const { email, password, otp } = parsed.data;
    const result = await evaluateLogin(email, password, otp);

    return NextResponse.json({
      reason: result.ok ? "OK" : result.reason,
    });
  } catch (error) {
    console.error("login-check error:", error);
    // Fail closed to the generic message rather than leaking details.
    return NextResponse.json({ reason: "INVALID" }, { status: 200 });
  }
}
