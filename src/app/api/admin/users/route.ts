import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { type UserRole } from "@/lib/rbac";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { USERNAME_REGEX, USERNAME_RULE_MESSAGE } from "@/lib/username";

// Helper for optional, possibly-empty string fields
const optStr = z.string().max(200).optional().nullable();

// Create user schema — accepts the full editable user profile
const createUserSchema = z.object({
  // Required core
  email: z.string().email(),
  password: z.string().min(8),

  // Account
  name: z.string().min(2).max(80).optional(),
  firstName: optStr,
  lastName: optStr,
  // Was min(2).max(40) with NO charset check, so an admin could set a handle
  // containing spaces or slashes and break that user's /u/<handle> page.
  username: z.string().trim().regex(USERNAME_REGEX, USERNAME_RULE_MESSAGE).optional().nullable(),
  phone: optStr,
  role: z
    .enum([
      "USER",
      "SUPER_ADMIN",
      "ADMIN",
      "FINANCE_ADMIN",
      "CONTENT_ADMIN",
      "SUPPORT_ADMIN",
      "MARKETING_ADMIN",
      "MODERATOR",
      "AGENCY",
      "AD_MANAGER",
    ])
    .default("USER"),
  customRoleId: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "PENDING_VERIFICATION"]).default("ACTIVE"),
  packageId: z.string().optional().nullable(),

  // Personal
  gender: optStr,
  dateOfBirth: z.string().optional().nullable(), // ISO date string
  nidNumber: optStr,
  profession: optStr,
  maritalStatus: optStr,
  studyLevel: optStr,
  nationality: optStr,
  bloodGroup: optStr,
  secondaryEmail: z.string().email().optional().nullable().or(z.literal("")),
  secondaryPhone: optStr,
  bio: z.string().max(500).optional().nullable(),

  // Address
  country: optStr,
  region: optStr,
  division: optStr,
  subDivision: optStr,
  district: optStr,
  subDistrict: optStr,
  city: optStr,
  village: optStr,
  street: optStr,
  postalCode: optStr,
});

// Tiny helper — empty string → null
const n = (s: unknown): string | null => {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t.length === 0 ? null : t;
};

// POST /api/admin/users - Create a new user
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminRole = session.user.role as UserRole | undefined;
    if (!(await can(session.user.id, "users.edit"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const validation = createUserSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validation.error.issues },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Only super admin can create admin accounts
    if (data.role !== "USER" && adminRole !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only super admin can create admin accounts" },
        { status: 403 }
      );
    }

    // Build a sensible display name if admin didn't supply one
    const composedName =
      n(data.name) ??
      ([n(data.firstName), n(data.lastName)].filter(Boolean).join(" ") ||
        data.email.split("@")[0]);

    // Check email uniqueness
    const existingEmail = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existingEmail) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 400 }
      );
    }

    // Check username uniqueness if provided
    if (data.username) {
      // Case-INSENSITIVE, matching every other username check in the app. The
      // case-sensitive version let an admin create "Alice" next to "alice".
      const existingUsername = await prisma.user.findFirst({
        where: { username: { equals: data.username, mode: "insensitive" } },
        select: { id: true },
      });
      if (existingUsername) {
        return NextResponse.json(
          { error: "Username already taken" },
          { status: 400 }
        );
      }
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);
    const referralCode = uuidv4().slice(0, 8).toUpperCase();

    let dateOfBirth: Date | null = null;
    if (data.dateOfBirth) {
      const dob = new Date(data.dateOfBirth);
      if (!Number.isNaN(dob.getTime())) {
        dateOfBirth = dob;
      }
    }

    const user = await prisma.user.create({
      data: {
        // Core
        email: data.email,
        password: hashedPassword,
        name: composedName.trim() || data.email.split("@")[0],
        firstName: n(data.firstName),
        lastName: n(data.lastName),
        username: n(data.username),
        phone: n(data.phone),
        role: data.role,
        status: data.status,
        packageId: data.packageId ?? null,
        // Personal
        gender: n(data.gender),
        dateOfBirth,
        nidNumber: n(data.nidNumber),
        profession: n(data.profession),
        maritalStatus: n(data.maritalStatus),
        studyLevel: n(data.studyLevel),
        nationality: n(data.nationality),
        bloodGroup: n(data.bloodGroup),
        secondaryEmail: n(data.secondaryEmail),
        secondaryPhone: n(data.secondaryPhone),
        bio: n(data.bio),
        // Address
        country: n(data.country),
        region: n(data.region),
        division: n(data.division),
        subDivision: n(data.subDivision),
        district: n(data.district),
        subDistrict: n(data.subDistrict),
        city: n(data.city),
        village: n(data.village),
        street: n(data.street),
        postalCode: n(data.postalCode),
        // Misc
        referralCode,
        emailVerified: data.status === "ACTIVE" ? new Date() : null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        package: { select: { slug: true, name: true } },
        createdAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "USER_CREATED",
        entity: "User",
        entityId: user.id,
        newData: {
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
    });

    return NextResponse.json({
      message: "User created successfully",
      user,
    });
  } catch (error) {
    console.error("Error creating user:", error);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}
