import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encode } from "next-auth/jwt";
import { cookies } from "next/headers";

// POST /api/auth/impersonate/login - Login using impersonation token
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

    // Update last login timestamp
    await prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });

    // Create JWT session token
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      throw new Error("NEXTAUTH_SECRET is not set");
    }

    const maxAge = 30 * 24 * 60 * 60; // 30 days
    const now = Math.floor(Date.now() / 1000);

    const sessionToken = await encode({
      token: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.avatar,
        role: user.role,
        sub: user.id,
        iat: now,
        exp: now + maxAge,
      },
      secret,
      salt: process.env.NODE_ENV === "production"
        ? "__Secure-authjs.session-token"
        : "authjs.session-token",
    });

    // Set the session cookie
    const cookieStore = await cookies();
    const cookieName = process.env.NODE_ENV === "production"
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";

    cookieStore.set(cookieName, sessionToken, {
      expires: new Date(Date.now() + maxAge * 1000),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    return NextResponse.json({
      success: true,
      message: "Impersonation successful",
    });
  } catch (error) {
    console.error("Error in impersonation login:", error);
    return NextResponse.json(
      { error: "Failed to login as user" },
      { status: 500 }
    );
  }
}
