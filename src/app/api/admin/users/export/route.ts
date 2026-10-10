import { toNum } from "@/lib/money";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { formatInternationalPhone } from "@/lib/phone-codes";
import { userDisplayId } from "@/lib/display-id";

import { csvCell, csvPhoneCell } from "@/lib/csv";
import { sourceLabel } from "@/lib/signup-source";
import {
  describeDevice,
  deviceBrandLabel,
  deviceOsLabel,
  deviceTypeLabel,
  type DeviceType,
} from "@/lib/device-info";

// GET /api/admin/users/export - Export users as CSV
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "users.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const role = searchParams.get("role");
    const kyc = searchParams.get("kyc");
    const packageTier = searchParams.get("package");

    // Build where clause
    const where: Prisma.UserWhereInput = {};

    if (status && status !== "all") {
      where.status = status as Prisma.EnumUserStatusFilter["equals"];
    }
    if (role && role !== "all") {
      where.role = role as Prisma.EnumUserRoleFilter["equals"];
    }
    if (kyc && kyc !== "all") {
      where.kycStatus = kyc as Prisma.EnumKYCStatusFilter["equals"];
    }
    if (packageTier && packageTier !== "all") {
      where.package = { slug: packageTier };
    }

    // Fetch all matching users
    const usersRaw = await prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        phone: true,
        country: true,
        role: true,
        status: true,
        kycStatus: true,
        package: { select: { slug: true, name: true } },
        pointsBalance: true,
        cashBalance: true,
        totalEarnings: true,
        totalWithdrawals: true,
        level: true,
        xp: true,
        referralCode: true,
        emailVerified: true,
        phoneVerified: true,
        createdAt: true,
        lastLoginAt: true,
        signupSource: true,
        signupCampaign: true,
        _count: {
          select: {
            referrals: true,
            taskSubmissions: true,
          },
        },
      },
    });

    // Type assertion for Prisma Accelerate
    type UserWithCount = typeof usersRaw[0] & {
      _count: { referrals: number; taskSubmissions: number };
      package: { slug: string; name: string } | null;
    };
    const users = usersRaw as unknown as UserWithCount[];

    // Each user's most recently used device (lib/device-info.ts), in chunks so
    // a full export stays a handful of queries.
    type LastDevice = {
      userId: string;
      deviceType: string | null;
      os: string | null;
      osVersion: string | null;
      brand: string | null;
      model: string | null;
      browser: string | null;
    };
    const lastDevice = new Map<string, LastDevice>();
    const deviceCount = new Map<string, number>();
    const ids = users.map((u) => u.id);
    for (let i = 0; i < ids.length; i += 5000) {
      const chunk = ids.slice(i, i + 5000);
      const [latest, counts] = await Promise.all([
        prisma.$queryRaw<LastDevice[]>`
          SELECT DISTINCT ON ("userId") "userId", "deviceType", "os", "osVersion", "brand", "model", "browser"
          FROM "UserDevice" WHERE "userId" = ANY(${chunk})
          ORDER BY "userId", "lastSeenAt" DESC`,
        prisma.$queryRaw<{ userId: string; n: number }[]>`
          SELECT "userId", COUNT(*)::int AS n FROM "UserDevice" WHERE "userId" = ANY(${chunk}) GROUP BY 1`,
      ]);
      for (const d of latest) lastDevice.set(d.userId, d);
      for (const c of counts) deviceCount.set(c.userId, c.n);
    }

    // Generate CSV
    const headers = [
      "Display ID",
      "Internal ID",
      "Name",
      "Email",
      "Username",
      "Phone",
      "Country",
      "Role",
      "Status",
      "KYC Status",
      "Package",
      "Points Balance",
      "Cash Balance",
      "Total Earnings",
      "Total Withdrawals",
      "Level",
      "XP",
      "Referral Code",
      "Email Verified",
      "Phone Verified",
      "Referrals Count",
      "Tasks Completed",
      "Created At",
      "Last Login",
      "Came From",
      "Campaign",
      "Main Device",
      "Device Type",
      "System",
      "Phone Brand",
      "Devices Used",
    ];

    const csvRows = [headers.map(csvCell).join(",")];

    for (const user of users) {
      const internationalPhone = formatInternationalPhone(user.phone, user.country);
      const dev = lastDevice.get(user.id);
      const row = [
        csvCell(userDisplayId(user.id)),
        csvCell(user.id),
        csvCell(user.name),
        csvCell(user.email),
        csvCell(user.username),
        csvPhoneCell(internationalPhone),
        csvCell(user.country),
        csvCell(user.role),
        csvCell(user.status),
        csvCell(user.kycStatus),
        csvCell(user.package?.name ?? ""),
        csvCell(user.pointsBalance),
        csvCell(user.cashBalance.toFixed(2)),
        // toNum first: this is a Prisma Decimal, and Decimal.toFixed uses its own
        // rounding mode — the CSV and the UI disagreed by a cent on halves.
        csvCell(toNum(user.totalEarnings).toFixed(2)),
        csvCell(user.totalWithdrawals.toFixed(2)),
        csvCell(user.level),
        csvCell(user.xp),
        csvCell(user.referralCode),
        csvCell(user.emailVerified ? "Yes" : "No"),
        csvCell(user.phoneVerified ? "Yes" : "No"),
        csvCell(user._count.referrals),
        csvCell(user._count.taskSubmissions),
        csvCell(user.createdAt.toISOString()),
        csvCell(user.lastLoginAt?.toISOString() ?? ""),
        csvCell(sourceLabel(user.signupSource)),
        csvCell(user.signupCampaign ?? ""),
        csvCell(dev ? describeDevice({ ...dev, type: (dev.deviceType ?? undefined) as DeviceType | undefined, os: dev.os ?? undefined, browser: dev.browser ?? undefined }) : ""),
        csvCell(dev?.deviceType ? deviceTypeLabel(dev.deviceType) : ""),
        csvCell(dev?.os ? deviceOsLabel(dev.os) : ""),
        csvCell(dev?.brand ? deviceBrandLabel(dev.brand) : ""),
        csvCell(deviceCount.get(user.id) ?? 0),
      ];
      csvRows.push(row.join(","));
    }

    // Excel needs a UTF-8 BOM to render non-ASCII characters correctly when
    // the file is opened directly via double-click.
    const csv = "﻿" + csvRows.join("\r\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="users_export_${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("Error exporting users:", error);
    return NextResponse.json(
      { error: "Failed to export users" },
      { status: 500 }
    );
  }
}
