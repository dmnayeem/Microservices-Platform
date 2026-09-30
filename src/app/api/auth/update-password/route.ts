import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { validatePassword } from "@/lib/password-policy";

const schema = z.object({
  currentPassword: z.string().min(1),
  // Enforced against the admin Security policy after parsing.
  newPassword: z.string().min(1, "New password is required"),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Per ACCOUNT, shared across instances. A stolen session must not be able to guess the current password.
  const limited = await enforceDbRateLimit(request, "password-change", session.user.id, 5, 15 * 60_000);
  if (limited) return limited;
  const body = await request.json();
  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  // Admin Security policy (password_min_length + require_strong_passwords).
  const pwError = await validatePassword(v.data.newPassword);
  if (pwError) {
    return NextResponse.json({ error: pwError }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { password: true },
  });
  if (!user?.password) {
    return NextResponse.json(
      { error: "No password set on this account" },
      { status: 400 }
    );
  }

  const valid = await bcrypt.compare(v.data.currentPassword, user.password);
  if (!valid) {
    return NextResponse.json(
      { error: "Current password is incorrect" },
      { status: 400 }
    );
  }

  const newHash = await bcrypt.hash(v.data.newPassword, 10);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { password: newHash },
  });

  return NextResponse.json({ success: true });
}
