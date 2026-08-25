import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * The advertiser's own billing details — who an invoice is addressed to.
 *
 * There was no billing identity anywhere in this platform: no company name, tax
 * id, address or billing email. A client who needs a proper invoice needs all of
 * those on it.
 *
 * Editing this does NOT change any invoice that already exists — each one
 * carries a frozen copy taken at issue time (`Invoice.billTo`). A document
 * somebody already has a copy of must not silently change underneath them.
 */

const schema = z.object({
  orgName: z.string().max(160).optional().nullable(),
  taxId: z.string().max(60).optional().nullable(),
  email: z.string().email().max(160).optional().nullable().or(z.literal("")),
  phone: z.string().max(40).optional().nullable(),
  addressLine1: z.string().max(160).optional().nullable(),
  addressLine2: z.string().max(160).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  postalCode: z.string().max(24).optional().nullable(),
  country: z.string().max(80).optional().nullable(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const profile = await prisma.billingProfile.findUnique({
    where: { userId: session.user.id },
  });
  return NextResponse.json({ profile });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid billing details" },
      { status: 400 }
    );
  }
  const d = Object.fromEntries(
    Object.entries(v.data).map(([k, val]) => [
      k,
      typeof val === "string" ? val.trim() || null : (val ?? null),
    ])
  );

  const profile = await prisma.billingProfile.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, ...d },
    update: d,
  });
  return NextResponse.json({ profile });
}
