"use client";

import { promptDialog } from "@/lib/confirm";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Eye,
  LogIn,
  Edit,
  Ban,
  Trash2,
  CheckCircle2,
  Users as UsersIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { ROLE_CONFIG, type UserRole } from "@/lib/rbac";
import { BulkActionsBar } from "@/components/admin/bulk-actions-bar";
import { PackageBadge } from "@/components/user/profile/badges";
import { Avatar } from "@/components/user/primitives/avatar";
import { userDisplayId } from "@/lib/display-id";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  username: string | null;
  avatar: string | null;
  role: string;
  status: string;
  kycStatus: string;
  package: { slug: string; name: string; badgeColor: string | null } | null;
  pointsBalance: number;
  cashBalance: number;
  level: number;
  country: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
}

interface UsersTableClientProps {
  users: UserRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  /** Base query string (without `page`) — client appends ?page=N */
  baseQuery: string;
  permissions: {
    canEdit: boolean;
    canBan: boolean;
    canDelete: boolean;
    canImpersonate: boolean;
  };
}

export function UsersTableClient({
  users,
  totalCount,
  page,
  pageSize,
  baseQuery,
  permissions,
}: UsersTableClientProps) {
  const buildHref = (newPage: number) => {
    const sep = baseQuery.length > 0 ? "&" : "";
    return `/admin/users?${baseQuery}${sep}page=${newPage}`;
  };
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const skip = (page - 1) * pageSize;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const allOnPageSelected =
    users.length > 0 && users.every((u) => selected.has(u.id));

  const togglePage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        users.forEach((u) => next.delete(u.id));
      } else {
        users.forEach((u) => next.add(u.id));
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Bulk action handlers
  const handleBulkBan = async (ids: string[]) => {
    try {
      const res = await fetch("/api/admin/users/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ban", ids }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(`${ids.length} user${ids.length === 1 ? "" : "s"} banned`);
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      toast.error("Failed to ban users", { description: String(err) });
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    try {
      const res = await fetch("/api/admin/users/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(`${ids.length} user${ids.length === 1 ? "" : "s"} deleted`);
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      toast.error("Failed to delete users", { description: String(err) });
    }
  };

  const postBulk = async (body: Record<string, unknown>, okMsg: string) => {
    try {
      const res = await fetch("/api/admin/users/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      toast.success(okMsg);
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      toast.error("Action failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleBulkEmail = async (ids: string[]) => {
    const subject = await promptDialog({ title: "Email subject", tone: "info", required: true, confirmLabel: "Next" });
    if (!subject) return;
    const message = await promptDialog({ title: "Email message", tone: "info", multiline: true, required: true, confirmLabel: "Send" });
    if (!message) return;
    await postBulk({ action: "sendEmail", ids, subject, message }, `Emailed ${ids.length} user(s)`);
  };

  const handleBulkPoints = async (ids: string[]) => {
    const raw = await promptDialog({ title: "Adjust points", description: "Points to add (use a negative number to deduct):", tone: "info", placeholder: "e.g. 100 or -50", confirmLabel: "Next" });
    if (raw === null) return;
    const points = parseInt(raw, 10);
    if (!Number.isInteger(points) || points === 0) {
      toast.error("Enter a non-zero whole number");
      return;
    }
    const reason = (await promptDialog({ title: "Reason", description: "Optional — shown in the audit log.", tone: "info", confirmLabel: "Apply" })) ?? undefined;
    await postBulk(
      { action: "adjustPoints", ids, points, reason },
      `Adjusted points for ${ids.length} user(s)`
    );
  };

  const handleBulkTier = async (ids: string[]) => {
    const packageId = await promptDialog({ title: "Change tier", description: "Package ID to assign (from /admin/packages):", tone: "info", required: true, confirmLabel: "Assign" });
    if (!packageId) return;
    await postBulk(
      { action: "changeTier", ids, packageId },
      `Changed tier for ${ids.length} user(s)`
    );
  };

  // Login as user (impersonate) — opens new tab
  const handleImpersonate = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/users/${id}/impersonate`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      // Backend returns either a token URL or sets a session — open dashboard
      window.open(data.url ?? "/dashboard", "_blank");
    } catch (err) {
      toast.error("Failed to impersonate user", { description: String(err) });
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/users/${id}/approve`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to approve user");
      }
      toast.success("User approved");
      router.refresh();
    } catch (err) {
      toast.error("Failed to approve user", { description: String(err) });
    }
  };

  return (
    <>
      <BulkActionsBar
        selectedIds={Array.from(selected)}
        onClear={() => setSelected(new Set())}
        handlers={{
          banSelected: permissions.canBan ? handleBulkBan : undefined,
          deleteSelected: permissions.canDelete ? handleBulkDelete : undefined,
          sendEmail: handleBulkEmail,
          adjustPoints: handleBulkPoints,
          changeTier: handleBulkTier,
        }}
      />

      <div className="glass overflow-hidden">
        <div className="hidden md:block overflow-x-auto scrollbar-thin">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/50">
                <th className="text-left py-4 pl-4 pr-2 w-10">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={togglePage}
                    className="rounded bg-slate-800 border-slate-600 text-blue-500 focus:ring-blue-500"
                    aria-label="Select all on this page"
                  />
                </th>
                <th className="text-left py-4 px-4 text-sm font-medium text-slate-400">User</th>
                <th className="text-left py-4 px-4 text-sm font-medium text-slate-400">Status</th>
                <th className="text-left py-4 px-4 text-sm font-medium text-slate-400">Role</th>
                <th className="text-left py-4 px-4 text-sm font-medium text-slate-400">KYC</th>
                <th className="text-left py-4 px-4 text-sm font-medium text-slate-400">Package</th>
                <th className="text-left py-4 px-4 text-sm font-medium text-slate-400">Balance</th>
                <th className="text-left py-4 px-4 text-sm font-medium text-slate-400">Country</th>
                <th className="text-left py-4 px-4 text-sm font-medium text-slate-400">Joined</th>
                <th className="text-left py-4 px-4 text-sm font-medium text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length > 0 ? (
                users.map((u) => {
                  const roleConfig =
                    ROLE_CONFIG[u.role as UserRole] || ROLE_CONFIG.USER;
                  const isSelected = selected.has(u.id);
                  return (
                    <tr
                      key={u.id}
                      className={cn(
                        "border-b border-slate-800 last:border-0 transition-colors",
                        isSelected ? "bg-blue-500/5" : "hover:bg-slate-800/40"
                      )}
                    >
                      <td className="py-4 pl-4 pr-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(u.id)}
                          className="rounded bg-slate-800 border-slate-600 text-blue-500 focus:ring-blue-500"
                          aria-label={`Select ${u.email}`}
                        />
                      </td>
                      <td className="py-4 px-4">
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="flex items-center gap-3 group"
                        >
                          <Avatar
                            src={u.avatar}
                            name={u.name || u.email}
                            size={40}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white group-hover:text-indigo-400 transition-colors">
                              {u.name || "Unnamed"}
                            </p>
                            <p className="text-xs text-slate-500 truncate max-w-50">
                              {u.email}
                            </p>
                            <p className="text-[10px] font-mono text-slate-600 mt-0.5">
                              {userDisplayId(u.id)}
                              {u.username && (
                                <span className="ml-1.5 font-sans">
                                  · @{u.username} · Lv {u.level}
                                </span>
                              )}
                            </p>
                          </div>
                        </Link>
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={cn(
                            "px-2 py-1 rounded-full text-xs font-medium",
                            u.status === "ACTIVE"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : u.status === "PENDING_VERIFICATION"
                              ? "bg-amber-500/10 text-amber-400"
                              : u.status === "SUSPENDED"
                              ? "bg-orange-500/10 text-orange-400"
                              : "bg-red-500/10 text-red-400"
                          )}
                        >
                          {u.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={cn(
                            "px-2 py-1 rounded-full text-xs font-medium",
                            roleConfig.bgColor,
                            roleConfig.color
                          )}
                        >
                          {roleConfig.label}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={cn(
                            "px-2 py-1 rounded-full text-xs font-medium",
                            u.kycStatus === "APPROVED"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : u.kycStatus === "PENDING"
                              ? "bg-amber-500/10 text-amber-400"
                              : u.kycStatus === "REJECTED"
                              ? "bg-red-500/10 text-red-400"
                              : "bg-slate-500/10 text-slate-400"
                          )}
                        >
                          {u.kycStatus.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        {u.package ? (
                          <PackageBadge
                            tier={u.package.slug}
                            name={u.package.name}
                            size="sm"
                          />
                        ) : (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400">
                            —
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <div className="text-sm">
                          <p className="text-white tabular-nums">
                            ${u.cashBalance.toFixed(2)}
                          </p>
                          <p className="text-xs text-slate-500 tabular-nums">
                            {u.pointsBalance.toLocaleString()} pts
                          </p>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-sm text-slate-400">
                        {u.country || "—"}
                      </td>
                      <td className="py-4 px-4 text-sm text-slate-400">
                        <p>
                          {formatDistanceToNow(u.createdAt, { addSuffix: true })}
                        </p>
                        {u.lastLoginAt && (
                          <p className="text-xs text-slate-600">
                            Last:{" "}
                            {formatDistanceToNow(u.lastLoginAt, {
                              addSuffix: true,
                            })}
                          </p>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1">
                          <Link
                            href={`/admin/users/${u.id}`}
                            className="p-1.5 rounded hover:bg-slate-700 text-blue-400 hover:text-blue-300"
                            title="View details"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          {permissions.canImpersonate && u.role !== "SUPER_ADMIN" && (
                            <button
                              onClick={() => handleImpersonate(u.id)}
                              className="p-1.5 rounded hover:bg-slate-700 text-indigo-400 hover:text-indigo-300"
                              title="Login as user"
                            >
                              <LogIn className="w-4 h-4" />
                            </button>
                          )}
                          {permissions.canEdit &&
                            u.status === "PENDING_VERIFICATION" && (
                              <button
                                onClick={() => handleApprove(u.id)}
                                className="p-1.5 rounded hover:bg-slate-700 text-emerald-400 hover:text-emerald-300"
                                title="Approve user"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                            )}
                          {permissions.canEdit && (
                            <Link
                              href={`/admin/users/${u.id}/edit`}
                              className="p-1.5 rounded hover:bg-slate-700 text-emerald-400 hover:text-emerald-300"
                              title="Edit user"
                            >
                              <Edit className="w-4 h-4" />
                            </Link>
                          )}
                          {permissions.canBan && u.role !== "SUPER_ADMIN" && (
                            <Link
                              href={`/admin/users/${u.id}?ban=1`}
                              className="p-1.5 rounded hover:bg-slate-700 text-yellow-400 hover:text-yellow-300"
                              title="Ban user"
                            >
                              <Ban className="w-4 h-4" />
                            </Link>
                          )}
                          {permissions.canDelete && u.role !== "SUPER_ADMIN" && (
                            <Link
                              href={`/admin/users/${u.id}?delete=1`}
                              className="p-1.5 rounded hover:bg-slate-700 text-red-400 hover:text-red-300"
                              title="Delete user"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-slate-500">
                    <UsersIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">No users found</p>
                    <p className="text-sm mt-1">Try adjusting your filters</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-slate-800">
          {users.length > 0 ? (
            users.map((u) => {
              const roleConfig =
                ROLE_CONFIG[u.role as UserRole] || ROLE_CONFIG.USER;
              const isSelected = selected.has(u.id);
              return (
                <div
                  key={u.id}
                  className={cn("p-4", isSelected && "bg-blue-500/5")}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(u.id)}
                      className="mt-1 rounded bg-slate-800 border-slate-600 text-blue-500 focus:ring-blue-500"
                      aria-label={`Select ${u.email}`}
                    />
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="flex items-center gap-3 min-w-0 flex-1"
                    >
                      <Avatar
                        src={u.avatar}
                        name={u.name || u.email}
                        size={40}
                        className="shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {u.name || "Unnamed"}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {u.email}
                        </p>
                      </div>
                    </Link>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-medium",
                        u.status === "ACTIVE"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : u.status === "PENDING_VERIFICATION"
                          ? "bg-amber-500/10 text-amber-400"
                          : u.status === "SUSPENDED"
                          ? "bg-orange-500/10 text-orange-400"
                          : "bg-red-500/10 text-red-400"
                      )}
                    >
                      {u.status.replace(/_/g, " ")}
                    </span>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-medium",
                        roleConfig.bgColor,
                        roleConfig.color
                      )}
                    >
                      {roleConfig.label}
                    </span>
                    {u.package && (
                      <PackageBadge
                        tier={u.package.slug}
                        name={u.package.name}
                        size="sm"
                      />
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-sm text-white tabular-nums">
                      ${u.cashBalance.toFixed(2)}
                      <span className="text-xs text-slate-500 ml-1.5">
                        {u.pointsBalance.toLocaleString()} pts
                      </span>
                    </p>
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="p-1.5 rounded hover:bg-slate-700 text-blue-400"
                        title="View details"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      {permissions.canEdit && (
                        <Link
                          href={`/admin/users/${u.id}/edit`}
                          className="p-1.5 rounded hover:bg-slate-700 text-emerald-400"
                          title="Edit user"
                        >
                          <Edit className="w-4 h-4" />
                        </Link>
                      )}
                      {permissions.canBan && (
                        <Link
                          href={`/admin/users/${u.id}?ban=1`}
                          className="p-1.5 rounded hover:bg-slate-700 text-yellow-400"
                          title="Ban user"
                        >
                          <Ban className="w-4 h-4" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-16 text-center text-slate-500">
              <UsersIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No users found</p>
              <p className="text-sm mt-1">Try adjusting your filters</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 flex-wrap gap-3">
          <p className="text-sm text-slate-500">
            Showing {totalCount === 0 ? 0 : skip + 1}–
            {Math.min(skip + pageSize, totalCount)} of{" "}
            {totalCount.toLocaleString()} users
          </p>
          <div className="flex items-center gap-1">
            <Link
              href={page > 1 ? buildHref(page - 1) : "#"}
              className={cn(
                "inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors",
                page > 1
                  ? "bg-slate-800 text-white hover:bg-slate-700"
                  : "bg-slate-800/50 text-slate-600 cursor-not-allowed"
              )}
              aria-disabled={page <= 1}
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Link>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) pageNum = i + 1;
                else if (page <= 3) pageNum = i + 1;
                else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                else pageNum = page - 2 + i;
                return (
                  <Link
                    key={pageNum}
                    href={buildHref(pageNum)}
                    className={cn(
                      "px-3 py-1.5 text-sm rounded-lg transition-colors tabular-nums",
                      pageNum === page
                        ? "bg-blue-600 text-white"
                        : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
                    )}
                  >
                    {pageNum}
                  </Link>
                );
              })}
            </div>
            <Link
              href={page < totalPages ? buildHref(page + 1) : "#"}
              className={cn(
                "inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors",
                page < totalPages
                  ? "bg-slate-800 text-white hover:bg-slate-700"
                  : "bg-slate-800/50 text-slate-600 cursor-not-allowed"
              )}
              aria-disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
