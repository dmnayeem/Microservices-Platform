import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import speakeasy from "speakeasy";
import { z } from "zod";

const schema = z.object({
  // A current TOTP code is REQUIRED to disable 2FA — a hijacked session must not
  // be able to silently strip 2FA with an empty body.
  code: z.string().regex(/^\d{6}$/, "A current 6-digit code is required"),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { twoFactorSecret: true, twoFactorEnabled: true },
  });
  if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
    return NextResponse.json(
      { error: "2FA is not enabled" },
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
    data: { twoFactorEnabled: false, twoFactorSecret: null },
  });

  return NextResponse.json({ success: true, enabled: false });
}
