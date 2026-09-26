"use client";

import { CountryFlag } from "@/components/admin/ui/country-flag";
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
// Employee vs customer comes from ONE place (src/lib/staff.ts), derived from
// ADMIN_ROLES. Never re-list roles here — that is how the leaderboard filter
// and the admin UI ended up able to disagree about who counts as staff.
import { accountTypeOf, ACCOUNT_TYPE_BADGE } from "@/lib/staff";
import { BulkActionsBar } from "@/components/admin/bulk-actions-bar";
import { PackageBadge } from "@/components/user/profile/badges";
import { Avatar } from "@/components/user/primitives/avatar";
import { userDisplayId } from "@/lib/display-id";
import { toast } from "@/lib/toast";
import { cn, usd } from "@/lib/utils";

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
  /** Null when the viewer has no finance access. */
  cashBalance: number | null;
  level: number;
  country: string | null;
  lastIp: string | null;
  signupIp: string | null;
  /** ISO code of the IP's country (lib/geo) — last seen / at sign-up. */
  lastCountry: string | null;
  signupCountry: string | null;
  /** Who brought this account in. Null = signed up directly. */
  referredBy: { id: string; name: string | null; username: string | null } | null;
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
                <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">User</th>
                <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Account</th>
                <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Location</th>
                <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Plan &amp; balance</th>
                <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Referred by</th>
                <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Activity</th>
                <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
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
                      <td className="py-3 px-3">
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full text-[11px] font-semibold",
                              u.status === "ACTIVE"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : u.status === "PENDING_VERIFICATION"
                                ? "bg-amber-500/10 text-amber-400"
                                : u.status === "SUSPENDED"
                                ? "bg-orange-500/10 text-orange-400"
                                : "bg-red-500/10 text-red-400"
                            )}
                          >
                            {u.status === "PENDING_VERIFICATION" ? "Unverified" : u.status.charAt(0) + u.status.slice(1).toLowerCase()}
                          </span>
                          <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium", roleConfig.bgColor, roleConfig.color)}>
                            {roleConfig.label}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] font-medium",
                              u.kycStatus === "APPROVED"
                                ? "text-emerald-400"
                                : u.kycStatus === "PENDING"
                                ? "text-amber-400"
                                : u.kycStatus === "REJECTED"
                                ? "text-red-400"
                                : "text-slate-500"
                            )}
                          >
                            KYC {u.kycStatus === "NOT_SUBMITTED" ? "not submitted" : u.kycStatus.toLowerCase()}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <LocationCell u={u} />
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-col items-start gap-1">
                          {u.package ? (
                            <PackageBadge tier={u.package.slug} name={u.package.name} size="sm" />
                          ) : (
                            <span className="text-xs text-slate-500">No plan</span>
                          )}
                          <span className="text-xs tabular-nums text-slate-400">
                            {u.pointsBalance.toLocaleString()} pts
                            {u.cashBalance !== null && <span className="text-slate-500"> · {usd(u.cashBalance)}</span>}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-sm">
                        {u.referredBy ? (
                          <Link
                            href={`/admin/users/${u.referredBy.id}`}
                            className="text-indigo-400 hover:text-indigo-300"
                          >
                            {u.referredBy.name || u.referredBy.username || "Unnamed"}
                          </Link>
                        ) : (
                          <span className="text-slate-600">Direct</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-sm text-slate-400">
                        <p className="whitespace-nowrap">
                          Joined {formatDistanceToNow(u.createdAt, { addSuffix: true })}
                        </p>
                        {u.lastLoginAt && (
                          <p className="text-xs text-slate-600 whitespace-nowrap">
                            Active{" "}
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
                  <td colSpan={8} className="py-16 text-center text-slate-500">
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
                    <div className="ml-auto shrink-0 text-right">
                      <LocationCell u={u} />
                    </div>
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
                    {(() => {
                      const badge = ACCOUNT_TYPE_BADGE[accountTypeOf(u.role)];
                      return (
                        <span
                          title={badge.title}
                          className={cn(
                            "px-1.5 py-0.5 rounded border text-[10px] font-medium uppercase tracking-wide",
                            badge.className
                          )}
                        >
                          {badge.label}
                        </span>
                      );
                    })()}
                    {u.package && (
                      <PackageBadge
                        tier={u.package.slug}
                        name={u.package.name}
                        size="sm"
                      />
                    )}
                  </div>
                  {u.referredBy && (
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      via{" "}
                      <Link
                        href={`/admin/users/${u.referredBy.id}`}
                        className="text-indigo-400"
                      >
                        {u.referredBy.name || u.referredBy.username || "Unnamed"}
                      </Link>
                    </p>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-sm text-white tabular-nums">
                      {u.cashBalance === null ? "—" : usd(u.cashBalance)}
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

/**
 * Where the account is: the country of its IP (last seen, else sign-up), with
 * the flag and the IP itself. Flags two things an admin should look at: a
 * profile country that does not match the IP, and an account that signed up
 * in one country and now logs in from another.
 */
function LocationCell({ u }: { u: UserRow }) {
  const ipCountry = u.lastCountry ?? u.signupCountry;
  const ip = u.lastIp ?? u.signupIp;
  const profile = u.country && /^[A-Za-z]{2}$/.test(u.country) ? u.country.toUpperCase() : null;
  const mismatch = profile && ipCountry && profile !== ipCountry;
  const moved = u.signupCountry && u.lastCountry && u.signupCountry !== u.lastCountry;
  if (!ipCountry && !ip) return <span className="text-xs text-slate-600">Not seen yet</span>;
  return (
    <div className="min-w-0 max-w-[11rem] text-sm">
      <CountryFlag code={ipCountry} showName className="text-slate-200" />
      {ip && <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500" title={ip}>{ip}</p>}
      {mismatch && (
        <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400" title="The country in the profile does not match where the IP is">
          Profile says <CountryFlag code={profile} />
        </p>
      )}
      {!mismatch && moved && (
        <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-slate-500" title="Signed up from a different country">
          joined from <CountryFlag code={u.signupCountry} />
        </p>
      )}
    </div>
  );
}
