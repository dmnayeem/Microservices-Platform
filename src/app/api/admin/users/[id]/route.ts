import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, parsePermissionOverrides, type UserRole } from "@/lib/rbac";
import { Prisma } from "@/generated/prisma/client";
import { parseFeatureOverrides } from "@/lib/packages";
import { z } from "zod";

// GET /api/admin/users/[id] - Get user details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "users.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        avatar: true,
        coverPhoto: true,
        bio: true,
        phone: true,
        country: true,
        language: true,
        timezone: true,
        role: true,
        status: true,
        kycStatus: true,
        isBlueVerified: true,
        verifiedBadgeStyle: true,
        package: { select: { id: true, slug: true, name: true } },
        packageExpiresAt: true,
        pointsBalance: true,
        cashBalance: true,
        totalEarnings: true,
        totalWithdrawals: true,
        level: true,
        xp: true,
        streak: true,
        emailVerified: true,
        phoneVerified: true,
        createdAt: true,
        lastLoginAt: true,
        referralCode: true,
        referredById: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Error fetching user:", error);
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 }
    );
  }
}

// Update schema — extended with all spec fields (admin_oo.md §5.02 Edit User Modal)
const updateUserSchema = z.object({
  // Account
  name: z.string().min(2).max(50).optional(),
  firstName: z.string().max(50).optional().nullable(),
  lastName: z.string().max(50).optional().nullable(),
  email: z.string().email().optional(),
  username: z.string().min(3).max(30).optional().nullable(),
  password: z.string().min(6).max(100).optional(),
  phone: z.string().optional().nullable(),
  role: z.enum([
    "USER",
    "TUTOR",
    "SUPER_ADMIN",
    "FINANCE_ADMIN",
    "CONTENT_ADMIN",
    "SUPPORT_ADMIN",
    "MARKETING_ADMIN",
    "MODERATOR",
    "AGENCY",
    "AD_MANAGER",
  ]).optional(),
  status: z.enum(["ACTIVE", "PENDING_VERIFICATION", "SUSPENDED", "BANNED"]).optional(),

  // Balance / progression
  level: z.number().int().min(1).max(100).optional(),
  xp: z.number().int().min(0).optional(),
  pointsBalance: z.number().int().min(0).optional(),
  cashBalance: z.number().min(0).optional(),
  packageId: z.string().nullable().optional(),
  packageExpiresAt: z.string().datetime().optional().nullable(),
  featureOverrides: z.record(z.string(), z.boolean()).optional().nullable(),
  permissionOverrides: z.record(z.string(), z.boolean()).optional().nullable(),
  kycStatus: z.enum(["NOT_SUBMITTED", "PENDING", "APPROVED", "REJECTED"]).optional(),
  twoFactorEnabled: z.boolean().optional(),
  tutorSuspended: z.boolean().optional(),
  isBlueVerified: z.boolean().optional(),
  verifiedBadgeStyle: z
    .enum(["BLUE", "GOLD", "RAINBOW", "EMERALD", "PURPLE", "ROSE", "OCEAN"])
    .optional()
    .nullable(),

  // Personal
  gender: z.enum(["Male", "Female", "Other"]).optional().nullable(),
  dateOfBirth: z.string().datetime().optional().nullable(),
  nidNumber: z.string().max(64).optional().nullable(),
  profession: z.string().max(64).optional().nullable(),
  maritalStatus: z.enum(["Single", "Married", "Divorced", "Widowed"]).optional().nullable(),
  studyLevel: z.enum(["School", "College", "University", "Not study right now"]).optional().nullable(),
  nationality: z.string().max(64).optional().nullable(),
  bloodGroup: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).optional().nullable(),
  secondaryEmail: z.string().email().optional().nullable(),
  secondaryPhone: z.string().max(32).optional().nullable(),
  bio: z.string().max(500).optional().nullable(),

  // Photos
  avatar: z.string().url().optional().nullable(),
  coverPhoto: z.string().url().optional().nullable(),

  // Address
  country: z.string().optional().nullable(),
  region: z.string().max(64).optional().nullable(),
  division: z.string().max(64).optional().nullable(),
  subDivision: z.string().max(64).optional().nullable(),
  district: z.string().max(64).optional().nullable(),
  subDistrict: z.string().max(64).optional().nullable(),
  city: z.string().max(64).optional().nullable(),
  village: z.string().max(64).optional().nullable(),
  street: z.string().max(128).optional().nullable(),
  postalCode: z.string().max(16).optional().nullable(),
});

// PATCH /api/admin/users/[id] - Update user
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminRole = session.user.role as UserRole | undefined;
    if (!(await can(session.user.id, "users.edit"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const validation = updateUserSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validation.error.issues },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Admin-role changes are SUPER_ADMIN-only. Role management was consolidated
    // here from the standalone /admin/access editor (feature #8); preserve that
    // page's stricter guard so a non-super `users.edit` admin can't grant or
    // revoke ANY admin role (not just SUPER_ADMIN).
    if (
      data.role !== undefined &&
      data.role !== existingUser.role &&
      (ADMIN_ROLES.includes(data.role) || ADMIN_ROLES.includes(existingUser.role)) &&
      adminRole !== "SUPER_ADMIN"
    ) {
      return NextResponse.json(
        { error: "Only a super admin can change admin roles" },
        { status: 403 }
      );
    }

    // Check if changing role to super admin (only super admin can do this)
    if (data.role === "SUPER_ADMIN" && adminRole !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only super admin can assign super admin role" },
        { status: 403 }
      );
    }

    // Check email uniqueness if changing email
    if (data.email && data.email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email: data.email },
      });
      if (emailExists) {
        return NextResponse.json(
          { error: "Email already in use" },
          { status: 400 }
        );
      }
    }

    // Check username uniqueness if changing username
    if (data.username && data.username !== existingUser.username) {
      const usernameExists = await prisma.user.findFirst({
        where: { username: data.username },
      });
      if (usernameExists) {
        return NextResponse.json(
          { error: "Username already taken" },
          { status: 400 }
        );
      }
    }

    // Build update object — pass through all defined fields
    const updateData: Record<string, unknown> = {};

    // Account
    if (data.name !== undefined) updateData.name = data.name;
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.username !== undefined) updateData.username = data.username;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.status !== undefined) updateData.status = data.status;

    // Password (hashed)
    if (data.password) {
      const bcrypt = (await import("bcryptjs")).default;
      updateData.password = await bcrypt.hash(data.password, 10);
    }

    // Balance / progression
    if (data.level !== undefined) updateData.level = data.level;
    if (data.xp !== undefined) updateData.xp = data.xp;
    if (data.pointsBalance !== undefined) updateData.pointsBalance = data.pointsBalance;
    if (data.cashBalance !== undefined) updateData.cashBalance = data.cashBalance;
    if (data.packageId !== undefined) updateData.packageId = data.packageId;
    if (data.packageExpiresAt !== undefined) {
      updateData.packageExpiresAt = data.packageExpiresAt
        ? new Date(data.packageExpiresAt)
        : null;
    }
    let grantTutor = false;
    if (data.featureOverrides !== undefined) {
      // Keep only known feature keys → boolean; store null when empty.
      const fo =
        data.featureOverrides === null
          ? {}
          : parseFeatureOverrides(data.featureOverrides);
      updateData.featureOverrides = Object.keys(fo).length ? fo : null;
      // One-click tutor grant: turning on "Sell Courses" promotes a plain USER
      // to TUTOR (+ profile) so course tools work without an application.
      if (fo.sellCourses === true && data.role === undefined) {
        const cur = await prisma.user.findUnique({
          where: { id },
          select: { role: true },
        });
        if (cur?.role === "USER") {
          updateData.role = "TUTOR";
          grantTutor = true;
        }
      }
    }
    // Per-user RBAC permission overrides — SUPER_ADMIN only (same gate as admin
    // role changes). Deny/grant individual admin permissions on top of the role.
    if (data.permissionOverrides !== undefined) {
      if (adminRole !== "SUPER_ADMIN") {
        return NextResponse.json(
          { error: "Only a super admin can edit permissions" },
          { status: 403 }
        );
      }
      const po =
        data.permissionOverrides === null
          ? {}
          : parsePermissionOverrides(data.permissionOverrides);
      updateData.permissionOverrides = Object.keys(po).length ? po : null;
    }
    if (data.kycStatus !== undefined) updateData.kycStatus = data.kycStatus;
    // 2FA reset: admin can only DISABLE (never force-enable) — clear the secret
    // too so the user must re-enroll from scratch.
    if (data.twoFactorEnabled === false) {
      updateData.twoFactorEnabled = false;
      updateData.twoFactorSecret = null;
    }
    if (data.isBlueVerified !== undefined)
      updateData.isBlueVerified = data.isBlueVerified;
    if (data.verifiedBadgeStyle !== undefined)
      updateData.verifiedBadgeStyle = data.verifiedBadgeStyle;

    // Personal
    if (data.gender !== undefined) updateData.gender = data.gender;
    if (data.dateOfBirth !== undefined) {
      updateData.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
    }
    if (data.nidNumber !== undefined) updateData.nidNumber = data.nidNumber;
    if (data.profession !== undefined) updateData.profession = data.profession;
    if (data.maritalStatus !== undefined)
      updateData.maritalStatus = data.maritalStatus;
    if (data.studyLevel !== undefined) updateData.studyLevel = data.studyLevel;
    if (data.nationality !== undefined) updateData.nationality = data.nationality;
    if (data.bloodGroup !== undefined) updateData.bloodGroup = data.bloodGroup;
    if (data.secondaryEmail !== undefined)
      updateData.secondaryEmail = data.secondaryEmail;
    if (data.secondaryPhone !== undefined)
      updateData.secondaryPhone = data.secondaryPhone;
    if (data.bio !== undefined) updateData.bio = data.bio;

    // Photos
    if (data.avatar !== undefined) updateData.avatar = data.avatar;
    if (data.coverPhoto !== undefined) updateData.coverPhoto = data.coverPhoto;

    // Address
    if (data.country !== undefined) updateData.country = data.country;
    if (data.region !== undefined) updateData.region = data.region;
    if (data.division !== undefined) updateData.division = data.division;
    if (data.subDivision !== undefined) updateData.subDivision = data.subDivision;
    if (data.district !== undefined) updateData.district = data.district;
    if (data.subDistrict !== undefined) updateData.subDistrict = data.subDistrict;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.village !== undefined) updateData.village = data.village;
    if (data.street !== undefined) updateData.street = data.street;
    if (data.postalCode !== undefined) updateData.postalCode = data.postalCode;

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        role: true,
        status: true,
        package: { select: { slug: true, name: true } },
        kycStatus: true,
      },
    });

    // If admin flipped the role to TUTOR, make sure a TutorProfile exists so
    // the tutor dashboard renders right away (no need to go through the
    // tutor-application flow when admin grants the role directly).
    if (data.role === "TUTOR" || grantTutor) {
      const { ensureTutorProfile } = await import("@/lib/tutor-application");
      await ensureTutorProfile(id);
    }

    // Tutor sell-courses suspension (per-user creator access, consolidated from
    // the tutors page in feature #8). Only applies when a TutorProfile exists.
    if (data.tutorSuspended !== undefined) {
      await prisma.tutorProfile.updateMany({
        where: { userId: id },
        data: { isSuspended: data.tutorSuspended },
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "USER_UPDATED",
        entity: "User",
        entityId: id,
        newData: updateData as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      message: "User updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/users/[id] - Delete user (soft delete / deactivate)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminRole = session.user.role as UserRole | undefined;
    if (adminRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Only super admin can delete users" }, { status: 403 });
    }

    const { id } = await params;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prevent deleting super admins
    if (user.role === "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Cannot delete super admin accounts" },
        { status: 400 }
      );
    }

    // Soft delete by setting status to BANNED and anonymizing data
    await prisma.user.update({
      where: { id },
      data: {
        status: "BANNED",
        email: `deleted_${id}@deleted.local`,
        name: "Deleted User",
        phone: null,
        avatar: null,
      },
    });

    return NextResponse.json({
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    );
  }
}
