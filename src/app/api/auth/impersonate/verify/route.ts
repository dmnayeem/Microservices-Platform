import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/auth/impersonate/verify - Verify impersonation token
export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    // The token must be the exact string we issue (32 random bytes, hex). It
    // went into the Prisma filter as-is, so a body of {"token":{"not":""}}
    // matched ANY live impersonation token and signed the caller in as that
    // user — no login needed. Anything that is not that shape is refused.
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    // Find and verify the token
    const verificationToken = await prisma.verificationToken.findFirst({
      where: {
        token,
        type: "IMPERSONATE",
        expires: {
          gt: new Date(),
        },
      },
    });

    if (!verificationToken) {
      return NextResponse.json(
        { error: "Invalid or expired impersonation token" },
        { status: 400 }
      );
    }

    // Extract user ID from identifier
    const userId = verificationToken.identifier.replace("impersonate:", "");

    // Get user details
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Delete the token so it can only be used once
    await prisma.verificationToken.deleteMany({
      where: {
        token: token,
        type: "IMPERSONATE",
      },
    });

    return NextResponse.json({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
  } catch (error) {
    console.error("Error verifying impersonation token:", error);
    return NextResponse.json(
      { error: "Failed to verify impersonation token" },
      { status: 500 }
    );
  }
}
