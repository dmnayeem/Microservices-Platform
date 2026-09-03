import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import {
  Users,
  Search,
  Filter,
  CheckCircle,
  Clock,
  Ban,
  FileCheck,
} from "lucide-react";
import Link from "next/link";
import { type UserRole } from "@/lib/rbac";
import { Prisma } from "@/generated/prisma/client";
import { UserStatus, UserRole as UserRoleEnum, KYCStatus } from "@/generated/prisma";
import { parsePage } from "@/lib/paginate";
import {
  ExportUsersButton,
  AddUserButton,
} from "@/components/admin/user-actions";
import { UsersTableClient } from "@/components/admin/users-table-client";
import {
  ActiveFilterChips,
  type FilterChip,
} from "@/components/admin/active-filter-chips";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    status?: string;
    role?: string;
    kyc?: string;
    package?: string;
    country?: string;
    gender?: string;
    studyLevel?: string;
    hasReferrals?: string;
    search?: string;
  }>;
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user?.id) redirect("/login");

  const userRole = session.user.role as UserRole | undefined;
  if (!(await can(session.user.id, "users.view"))) redirect("/admin");

  const params = await searchParams;
  const page = parsePage(params.page);
  const pageSize = 20;
  const skip = (page - 1) * pageSize;

  // Build where clause based on filters. Enum filters are validated against the
  // generated enum value sets — a raw `as` cast would let an out-of-enum query
  // string (e.g. ?status=active) reach Prisma and throw a validation error.
  const where: Prisma.UserWhereInput = {};

  if (params.status && params.status !== "all" && params.status in UserStatus) {
    where.status = params.status as Prisma.EnumUserStatusFilter["equals"];
  }
  if (params.role && params.role !== "all" && params.role in UserRoleEnum) {
    where.role = params.role as Prisma.EnumUserRoleFilter["equals"];
  }
  if (params.kyc && params.kyc !== "all" && params.kyc in KYCStatus) {
    where.kycStatus = params.kyc as Prisma.EnumKYCStatusFilter["equals"];
  }
  if (params.package && params.package !== "all") {
    // Filter by Package.slug (e.g. ?package=pro-monthly).
    where.package = { slug: params.package };
  }
  if (params.country && params.country.trim()) {
    where.country = {
      contains: params.country.trim(),
      mode: "insensitive",
    };
  }
  if (params.gender && params.gender !== "all") {
    where.gender = params.gender;
  }
  if (params.studyLevel && params.studyLevel !== "all") {
    where.studyLevel = params.studyLevel;
  }
  if (params.hasReferrals === "yes") {
    where.referrals = { some: {} };
  } else if (params.hasReferrals === "no") {
    where.referrals = { none: {} };
  }
  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: "insensitive" } },
      { email: { contains: params.search, mode: "insensitive" } },
      { username: { contains: params.search, mode: "insensitive" } },
    ];
  }

  // Fetch users and stats
  const [
    allUsers,
    totalCount,
    activeCount,
    pendingCount,
    bannedCount,
    pendingKycCount,
  ] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        avatar: true,
        role: true,
        status: true,
        kycStatus: true,
        package: { select: { slug: true, name: true, badgeColor: true } },
        pointsBalance: true,
        cashBalance: true,
        level: true,
        country: true,
        // Who brought them in. The list could filter on "has referrals"
        // (downstream) but never showed the upstream side, so there was no way
        // to see that a run of new accounts all came from one person.
        referredBy: { select: { id: true, name: true, username: true } },
        createdAt: true,
        lastLoginAt: true,
      },
    }),
    prisma.user.count({ where }),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { status: "PENDING_VERIFICATION" } }),
    prisma.user.count({ where: { status: "BANNED" } }),
    prisma.user.count({ where: { kycStatus: "PENDING" } }),
  ]);

  // Build base query string (without page) for client pagination
  const baseQueryParams = new URLSearchParams();
  if (params.status) baseQueryParams.set("status", params.status);
  if (params.role) baseQueryParams.set("role", params.role);
  if (params.kyc) baseQueryParams.set("kyc", params.kyc);
  if (params.package) baseQueryParams.set("package", params.package);
  if (params.country) baseQueryParams.set("country", params.country);
  if (params.gender) baseQueryParams.set("gender", params.gender);
  if (params.studyLevel) baseQueryParams.set("studyLevel", params.studyLevel);
  if (params.hasReferrals) baseQueryParams.set("hasReferrals", params.hasReferrals);
  if (params.search) baseQueryParams.set("search", params.search);
  const baseQuery = baseQueryParams.toString();

  // Build active filter chips
  const chips: FilterChip[] = [];
  if (params.search)
    chips.push({ key: "search", label: "Search", value: params.search });
  if (params.status && params.status !== "all")
    chips.push({
      key: "status",
      label: "Status",
      value: params.status.replace(/_/g, " "),
    });
  if (params.role && params.role !== "all")
    chips.push({ key: "role", label: "Role", value: params.role });
  if (params.kyc && params.kyc !== "all")
    chips.push({ key: "kyc", label: "KYC", value: params.kyc });
  if (params.package && params.package !== "all")
    chips.push({ key: "package", label: "Package", value: params.package });
  if (params.country)
    chips.push({ key: "country", label: "Country", value: params.country });
  if (params.gender && params.gender !== "all")
    chips.push({ key: "gender", label: "Gender", value: params.gender });
  if (params.studyLevel && params.studyLevel !== "all")
    chips.push({
      key: "studyLevel",
      label: "Study Level",
      value: params.studyLevel,
    });
  if (params.hasReferrals && params.hasReferrals !== "any")
    chips.push({
      key: "hasReferrals",
      label: "Has Referrals",
      value: params.hasReferrals === "yes" ? "Yes" : "No",
    });

  const totalUsersAll = activeCount + pendingCount + bannedCount;

  const isSuperAdmin = userRole === "SUPER_ADMIN";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Manage and monitor all platform users
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {pendingKycCount > 0 && (
            <Link
              href="/admin/users/kyc"
              className="inline-flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-lg hover:bg-amber-500/20 transition-colors text-sm"
            >
              <FileCheck className="w-4 h-4" />
              KYC Queue ({pendingKycCount})
            </Link>
          )}
          <ExportUsersButton
            queryParams={`status=${params.status || ""}&role=${
              params.role || ""
            }&kyc=${params.kyc || ""}&package=${params.package || ""}`}
          />
          <AddUserButton canEdit={await can(session.user.id, "users.edit")} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link
          href="/admin/users"
          className="bg-slate-900 rounded-xl border border-slate-800 p-4 hover:border-indigo-500/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <Users className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white tabular-nums">
                {totalUsersAll.toLocaleString()}
              </p>
              <p className="text-sm text-slate-500">Total Users</p>
            </div>
          </div>
        </Link>
        <Link
          href="/admin/users?status=ACTIVE"
          className={`bg-slate-900 rounded-xl border p-4 transition-colors ${
            params.status === "ACTIVE"
              ? "border-emerald-500/50"
              : "border-slate-800 hover:border-emerald-500/50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white tabular-nums">
                {activeCount.toLocaleString()}
              </p>
              <p className="text-sm text-slate-500">Active</p>
            </div>
          </div>
        </Link>
        <Link
          href="/admin/users?status=PENDING_VERIFICATION"
          className={`bg-slate-900 rounded-xl border p-4 transition-colors ${
            params.status === "PENDING_VERIFICATION"
              ? "border-amber-500/50"
              : "border-slate-800 hover:border-amber-500/50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <Clock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white tabular-nums">
                {pendingCount.toLocaleString()}
              </p>
              <p className="text-sm text-slate-500">Pending</p>
            </div>
          </div>
        </Link>
        <Link
          href="/admin/users?status=BANNED"
          className={`bg-slate-900 rounded-xl border p-4 transition-colors ${
            params.status === "BANNED"
              ? "border-red-500/50"
              : "border-slate-800 hover:border-red-500/50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <Ban className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white tabular-nums">
                {bannedCount.toLocaleString()}
              </p>
              <p className="text-sm text-slate-500">Banned</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Filters — 8-filter bar per spec */}
      <form
        method="get"
        className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-3"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative col-span-1 md:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="search"
              name="search"
              defaultValue={params.search}
              placeholder="Username, email, ID…"
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Status */}
          <select
            name="status"
            defaultValue={params.status || "all"}
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="PENDING_VERIFICATION">Pending</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="BANNED">Banned</option>
          </select>

          {/* KYC */}
          <select
            name="kyc"
            defaultValue={params.kyc || "all"}
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All KYC</option>
            <option value="NOT_SUBMITTED">Not Submitted</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Verified</option>
            <option value="REJECTED">Rejected</option>
          </select>

          {/* Package */}
          <select
            name="package"
            defaultValue={params.package || "all"}
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Packages</option>
            <option value="FREE">Free</option>
            <option value="STARTER">Starter</option>
            <option value="PRO">Pro</option>
            <option value="ELITE">Elite</option>
            <option value="VIP">VIP</option>
          </select>

          {/* Country */}
          <input
            type="text"
            name="country"
            defaultValue={params.country}
            placeholder="Country"
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />

          {/* Gender */}
          <select
            name="gender"
            defaultValue={params.gender || "all"}
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Genders</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>

          {/* Study Level */}
          <select
            name="studyLevel"
            defaultValue={params.studyLevel || "all"}
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Study Levels</option>
            <option value="School">School</option>
            <option value="College">College</option>
            <option value="University">University</option>
            <option value="Not study right now">Not Studying</option>
          </select>

          {/* Has Referrals */}
          <select
            name="hasReferrals"
            defaultValue={params.hasReferrals || "any"}
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="any">Any Referrals</option>
            <option value="yes">Has Referrals</option>
            <option value="no">No Referrals</option>
          </select>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800 flex-wrap">
          <Link
            href="/admin/users"
            className="text-sm text-slate-400 hover:text-white"
          >
            Reset all
          </Link>
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-lg text-sm text-white hover:bg-blue-700 transition-colors"
          >
            <Filter className="w-4 h-4" />
            Apply Filters
          </button>
        </div>
      </form>

      {/* Active filter chips */}
      <ActiveFilterChips chips={chips} />

      {/* Users Table — client component for selection / bulk actions */}
      <UsersTableClient
        users={
          allUsers.map((u) => ({
            ...u,
            cashBalance: toNum(u.cashBalance),
          })) as unknown as Parameters<typeof UsersTableClient>[0]["users"]
        }
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        baseQuery={baseQuery}
        permissions={{
          canEdit: await can(session.user.id, "users.edit"),
          canBan: await can(session.user.id, "users.ban"),
          canDelete: await can(session.user.id, "users.delete"),
          canImpersonate: await can(session.user.id, "users.impersonate"),
        }}
      />

      {/* Privileged-action notice for non-super-admins */}
      {!isSuperAdmin && (
        <p className="text-xs text-slate-500 text-center">
          Some actions are restricted to your role. See{" "}
          <Link href="/admin/access" className="text-slate-400 hover:text-white underline-offset-2 hover:underline">
            Admin Access Control
          </Link>{" "}
          for the full permission matrix.
        </p>
      )}
    </div>
  );
}
