import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import {
  parsePermissionOverrides,
  canAdministerStaffAccount,
  canAssignStaffRole,
  isFinancePermission,
  SUPERADMIN_ONLY_PERMISSIONS,
  type Permission,
  type UserRole,
} from "@/lib/rbac";
import { TransactionType } from "@/generated/prisma/client";
import { parseFeatureOverrides } from "@/lib/packages";
import { recordTransaction } from "@/lib/ledger";
import { getPointsPerUsd } from "@/lib/economy";
import { toNum } from "@/lib/money";
import { resolveCountryCode } from "@/lib/country-codes";
import { z } from "zod";
import { USERNAME_REGEX, USERNAME_RULE_MESSAGE } from "@/lib/username";

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
  username: z.string().trim().regex(USERNAME_REGEX, USERNAME_RULE_MESSAGE).optional().nullable(),
  password: z.string().min(6).max(100).optional(),
  phone: z.string().optional().nullable(),
  role: z.enum([
    "USER",
    "TUTOR",
    "SUPER_ADMIN",
    "MANAGER",
    "ADMIN",
    "FINANCE_ADMIN",
    "CONTENT_ADMIN",
    "SUPPORT_ADMIN",
    "MARKETING_ADMIN",
    "MODERATOR",
    "AGENCY",
    "AD_MANAGER",
  ]).optional(),
  customRoleId: z.string().optional().nullable(),
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
  pageOverrides: z.record(z.string(), z.boolean()).optional().nullable(),
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

    // ── Staff-account invariant (target side) ──
    // Who may touch THIS account at all — any field: status, password, email,
    // balance, role, overrides. Not just the role field.
    //
    // The hole this replaces: the old check only refused SUPER_ADMIN targets.
    // Role changes were separately gated to super admin, so it LOOKED closed —
    // but `password` (line ~308) and `email` were still writable on any other
    // admin. A SUPPORT_ADMIN with `users.edit` could reset the FINANCE_ADMIN's
    // password and sign in as them, reaching every finance permission without
    // ever changing their own role. Gating the role field alone is not a
    // hierarchy; gating the whole account is.
    const targetCheck = canAdministerStaffAccount(
      adminRole,
      existingUser.role as UserRole
    );
    if (!targetCheck.ok) {
      return NextResponse.json({ error: targetCheck.reason }, { status: 403 });
    }

    // Assigning or clearing a custom role is an admin-role change → super-admin
    // only. A custom-role user carries role="ADMIN" as the admin baseline.
    let resolvedCustomRoleId: string | null | undefined = undefined;
    if (
      data.customRoleId !== undefined &&
      data.customRoleId !== existingUser.customRoleId
    ) {
      if (adminRole !== "SUPER_ADMIN") {
        return NextResponse.json(
          { error: "Only a super admin can assign a custom role" },
          { status: 403 }
        );
      }
      if (data.customRoleId) {
        const cr = await prisma.customRole.findUnique({
          where: { id: data.customRoleId },
          select: { isActive: true },
        });
        if (!cr?.isActive) {
          return NextResponse.json(
            { error: "Custom role not found or inactive" },
            { status: 400 }
          );
        }
        resolvedCustomRoleId = data.customRoleId;
      } else {
        resolvedCustomRoleId = null;
      }
    }

    // ── Staff-role invariant (assignment side) ──
    // A role change has two sides and both must pass. The target check above
    // already refused editing a finance admin at all; this one refuses
    // PROMOTING anybody INTO finance admin, manager or super admin.
    //
    // Concretely, for a MANAGER actor this is what blocks:
    //   - promoting themselves or anyone else to FINANCE_ADMIN
    //   - promoting themselves or anyone else to SUPER_ADMIN (escalation above
    //     their own tier — the classic hole)
    //   - minting a second MANAGER
    // Every other admin role remains assignable, which is the Manager's job.
    if (data.role !== undefined && data.role !== existingUser.role) {
      const assignCheck = canAssignStaffRole(adminRole, data.role as UserRole);
      if (!assignCheck.ok) {
        return NextResponse.json({ error: assignCheck.reason }, { status: 403 });
      }
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
    // Custom role: set the FK + force the ADMIN baseline role; clearing (null)
    // just drops the FK (role falls back to whatever `data.role` set, else stays).
    if (resolvedCustomRoleId !== undefined) {
      updateData.customRoleId = resolvedCustomRoleId;
      if (resolvedCustomRoleId) updateData.role = "ADMIN";
    }
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
    // Per-user RBAC permission overrides — SUPER_ADMIN, or a MANAGER acting on
    // an account it is allowed to administer (checked above). Deny/grant
    // individual admin permissions on top of the role.
    if (data.permissionOverrides !== undefined) {
      if (adminRole !== "SUPER_ADMIN" && adminRole !== "MANAGER") {
        return NextResponse.json(
          { error: "Only a super admin or manager can edit permissions" },
          { status: 403 }
        );
      }
      let po =
        data.permissionOverrides === null
          ? {}
          : parsePermissionOverrides(data.permissionOverrides);
      // A manager may not hand out money permissions — not to someone else and
      // (since a manager can be the target of their own edit) not to themselves.
      // Dropped rather than rejected: the manager sees the other grants apply
      // and the finance ones simply are not there, which is the truth.
      //
      // This is belt-and-braces. Even if it were bypassed, a granted finance
      // permission dies in `stripProtectedForRole` at resolve time for every
      // role except SUPER_ADMIN and FINANCE_ADMIN — and a manager can never
      // make anyone a FINANCE_ADMIN (see the assignment check above).
      if (adminRole === "MANAGER") {
        po = Object.fromEntries(
          Object.entries(po).filter(
            ([perm]) =>
              !isFinancePermission(perm as Permission) &&
              !SUPERADMIN_ONLY_PERMISSIONS.includes(perm as Permission)
          )
        );
      }
      updateData.permissionOverrides = Object.keys(po).length ? po : null;
    }
    if (data.pageOverrides !== undefined) {
      if (adminRole !== "SUPER_ADMIN") {
        return NextResponse.json(
          { error: "Only a super admin can edit page visibility" },
          { status: 403 }
        );
      }
      // Keep only real booleans; empty → null so it clears the override.
      const raw = data.pageOverrides ?? {};
      const cleaned: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (typeof v === "boolean") cleaned[k] = v;
      }
      updateData.pageOverrides = Object.keys(cleaned).length ? cleaned : null;
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
    //
    // `country` is stored as ISO-3166-1 alpha-2 and nothing else. This box used
    // to be free text with the placeholder "Bangladesh", which is exactly what
    // three live accounts ended up holding — and a country NAME matches no ad
    // targeting rule, no audience segment and no report bucket, silently.
    // Anything the canonical `Country` table can recognise (ISO2, ISO3, the
    // full name) is accepted and stored as the code; anything else is refused
    // rather than written half-valid.
    if (data.country !== undefined) {
      if (data.country === null || data.country === "") {
        updateData.country = null;
      } else {
        const iso2 = await resolveCountryCode(data.country);
        if (!iso2) {
          return NextResponse.json(
            { error: `Unknown country "${data.country}" — use its ISO code` },
            { status: 400 }
          );
        }
        updateData.country = iso2;
      }
    }
    if (data.region !== undefined) updateData.region = data.region;
    if (data.division !== undefined) updateData.division = data.division;
    if (data.subDivision !== undefined) updateData.subDivision = data.subDivision;
    if (data.district !== undefined) updateData.district = data.district;
    if (data.subDistrict !== undefined) updateData.subDistrict = data.subDistrict;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.village !== undefined) updateData.village = data.village;
    if (data.street !== undefined) updateData.street = data.street;
    if (data.postalCode !== undefined) updateData.postalCode = data.postalCode;

    // This modal SETS pointsBalance/cashBalance to absolute values. Capture the
    // prior values so we can journal the delta — otherwise an admin balance edit
    // would be invisible in the user's transaction history.
    const settingPoints = data.pointsBalance !== undefined;
    const settingCash = data.cashBalance !== undefined;
    // Setting a balance is money, not profile editing. This route used to
    // need only `users.edit`, so any admin could mint points from the edit
    // form and step around `users.adjust_balance` — which is finance, held by
    // the super admin, the finance admin, or someone granted it by name.
    if ((settingPoints || settingCash) && !(await can(session.user.id, "users.adjust_balance"))) {
      return NextResponse.json(
        { error: "Changing a balance needs the balance permission — ask a super admin." },
        { status: 403 }
      );
    }
    const priorBal =
      settingPoints || settingCash
        ? await prisma.user.findUnique({
            where: { id },
            select: { pointsBalance: true, cashBalance: true },
          })
        : null;

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

    // Journal balance deltas from the absolute set + keep totalEarnings in sync
    // on a positive points delta (matching the bulk-adjust route).
    if (priorBal) {
      const pointsDelta = settingPoints
        ? (data.pointsBalance as number) - priorBal.pointsBalance
        : 0;
      const cashDelta = settingCash
        ? (data.cashBalance as number) - toNum(priorBal.cashBalance)
        : 0;
      if (pointsDelta !== 0 || cashDelta !== 0) {
        const pointsPerUsd = await getPointsPerUsd();
        if (pointsDelta > 0 && pointsPerUsd > 0) {
          await prisma.user.update({
            where: { id },
            data: { totalEarnings: { increment: pointsDelta / pointsPerUsd } },
          });
        }
        await recordTransaction(prisma, {
          userId: id,
          type: pointsDelta + cashDelta >= 0 ? TransactionType.BONUS : TransactionType.PENALTY,
          points: pointsDelta,
          amountUsd: cashDelta,
          description: `Admin balance ${pointsDelta + cashDelta >= 0 ? "credit" : "debit"}`,
          // Per-occurrence by design. An admin may apply the same balance
          // adjustment to one user more than once.
          // A deterministic key would make `Transaction @@unique([userId, reference])`
          // reject the second one, so this stays keyed on the instant it happened.
          reference: `admin_edit_${id}_${Date.now()}`,
          metadata: { adminId: session.user.id, via: "edit-user" },
        });
      }
    }

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
    await writeAudit({
      actorId: session.user.id,
      action: "USER_UPDATED",
      entity: "User",
      entityId: id,
      targetUserId: id,
      summary: `Edited user profile (${Object.keys(updateData).slice(0, 6).join(", ") || "no fields"})`,
      meta: updateData as Record<string, unknown>,
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
    if (adminRole !== "SUPER_ADMIN" && adminRole !== "MANAGER") {
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

    // Removal is the fourth way to control an account, so it runs the same
    // hierarchy check as editing it. A manager removing a finance admin would
    // be "a manager cannot reach finance" defeated by a different verb — the
    // check refuses it, and refuses removing a super admin or another manager.
    const delCheck = canAdministerStaffAccount(adminRole, user.role as UserRole);
    if (!delCheck.ok) {
      return NextResponse.json({ error: delCheck.reason }, { status: 403 });
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
