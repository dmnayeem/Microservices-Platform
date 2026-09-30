import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { prisma } from "@/lib/prisma";
import speakeasy from "speakeasy";
import { z } from "zod";

const schema = z.object({
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Per ACCOUNT, shared across instances. Guessing codes against the enable step.
  const limited = await enforceDbRateLimit(request, "2fa-enable", session.user.id, 10, 15 * 60_000);
  if (limited) return limited;
  const body = await request.json();
  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid code" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { twoFactorSecret: true, twoFactorEnabled: true },
  });
  if (!user?.twoFactorSecret) {
    return NextResponse.json(
      { error: "Run setup first to generate a secret" },
      { status: 400 }
    );
  }

  const isValid = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: "base32",
    token: v.data.code,
    window: 2,
  });

  if (!isValid) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { twoFactorEnabled: true },
  });

  return NextResponse.json({ success: true, enabled: true });
}
