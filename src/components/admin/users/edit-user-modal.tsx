"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Loader2,
  Eye,
  EyeOff,
  Copy,
  Sparkles,
  Camera,
  Trash2,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  VerifiedBadge,
  VERIFIED_BADGE_STYLES,
  type VerifiedBadgeStyle,
} from "@/components/user/profile/verified-badge";
import { userDisplayId } from "@/lib/display-id";
import { isAdmin, type UserRole } from "@/lib/rbac";
import { FEATURES } from "@/lib/features";
import { SmartImage } from "@/components/user/primitives/smart-image";

// Generate a 12-char password with at least 1 lower / upper / digit / symbol
function generateRandomPassword(length = 12): string {
  const lower = "abcdefghijkmnpqrstuvwxyz"; // ambiguous chars (l, o) removed
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789"; // ambiguous (0, 1) removed
  const symbols = "!@#$%^&*?";
  const all = lower + upper + digits + symbols;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  // Guarantee one of each class up front, then fill the rest randomly
  const required = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => pick(all));
  return [...required, ...rest]
    .sort(() => Math.random() - 0.5)
    .join("");
}

export interface EditUserData {
  id: string;
  // Account
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
  username: string | null;
  phone: string | null;
  role: string;
  status: string;
  // Balance / progression
  level: number;
  xp: number;
  pointsBalance: number;
  cashBalance: number;
  packageId: string | null;
  packageExpiresAt: Date | null;
  featureOverrides?: Record<string, boolean> | null;
  kycStatus: string;
  twoFactorEnabled: boolean;
  /** Whether the user has a TutorProfile (controls the sell-courses suspend toggle). */
  hasTutorProfile: boolean;
  tutorSuspended: boolean;
  isBlueVerified: boolean;
  verifiedBadgeStyle: string | null;
  // Personal
  gender: string | null;
  dateOfBirth: Date | null;
  nidNumber: string | null;
  profession: string | null;
  maritalStatus: string | null;
  studyLevel: string | null;
  nationality: string | null;
  bloodGroup: string | null;
  secondaryEmail: string | null;
  secondaryPhone: string | null;
  bio: string | null;
  avatar: string | null;
  coverPhoto: string | null;
  // Address
  country: string | null;
  region: string | null;
  division: string | null;
  subDivision: string | null;
  district: string | null;
  subDistrict: string | null;
  city: string | null;
  village: string | null;
  street: string | null;
  postalCode: string | null;
}

interface UserEditFormProps {
  user: EditUserData;
  isSuperAdmin: boolean;
  /** All active plans, used to populate the plan picker. */
  plans: Array<{ id: string; slug: string; name: string }>;
  /** Called when admin clicks Cancel or after successful Save. Defaults to router.back(). */
  onDone?: () => void;
}

type Tab = "account" | "verify" | "balance" | "photos" | "personal" | "address" | "access";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "account", label: "Account" },
  { id: "verify", label: "🔑 Verify & Password" },
  { id: "balance", label: "Balance & Tier" },
  { id: "access", label: "Feature Access" },
  { id: "photos", label: "Photos" },
  { id: "personal", label: "Personal Info" },
  { id: "address", label: "Address" },
];

const PROFESSIONS = [
  "Student",
  "Software Engineer",
  "Designer",
  "Teacher",
  "Doctor",
  "Lawyer",
  "Business Owner",
  "Freelancer",
  "Marketing",
  "Sales",
  "Accountant",
  "Engineer",
  "Healthcare",
  "Retail",
  "Other",
];

export function UserEditForm({
  user,
  isSuperAdmin,
  plans,
  onDone,
}: UserEditFormProps) {
  const router = useRouter();
  const handleDone = () => {
    if (onDone) {
      onDone();
    } else {
      router.back();
    }
  };
  const [tab, setTab] = useState<Tab>("account");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Form state — initialized from user, all fields strings (or "" / undefined)
  const [form, setForm] = useState({
    name: user.name ?? "",
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    email: user.email,
    username: user.username ?? "",
    password: "", // empty = keep
    phone: user.phone ?? "",
    role: user.role,
    status: user.status,

    level: user.level,
    xp: user.xp,
    pointsBalance: user.pointsBalance,
    cashBalance: user.cashBalance,
    packageId: user.packageId ?? "",
    packageExpiresAt: user.packageExpiresAt
      ? new Date(user.packageExpiresAt).toISOString().slice(0, 10)
      : "",
    featureOverrides: {
      ...((user.featureOverrides ?? {}) as Record<string, boolean>),
    } as Record<string, boolean>,
    kycStatus: user.kycStatus,
    twoFactorEnabled: user.twoFactorEnabled,
    tutorSuspended: user.tutorSuspended,
    isBlueVerified: user.isBlueVerified,
    verifiedBadgeStyle: user.verifiedBadgeStyle ?? "BLUE",

    gender: user.gender ?? "",
    dateOfBirth: user.dateOfBirth
      ? new Date(user.dateOfBirth).toISOString().slice(0, 10)
      : "",
    nidNumber: user.nidNumber ?? "",
    profession: user.profession ?? "",
    maritalStatus: user.maritalStatus ?? "",
    studyLevel: user.studyLevel ?? "",
    nationality: user.nationality ?? "",
    bloodGroup: user.bloodGroup ?? "",
    secondaryEmail: user.secondaryEmail ?? "",
    secondaryPhone: user.secondaryPhone ?? "",
    bio: user.bio ?? "",

    avatar: user.avatar ?? "",
    coverPhoto: user.coverPhoto ?? "",

    country: user.country ?? "",
    region: user.region ?? "",
    division: user.division ?? "",
    subDivision: user.subDivision ?? "",
    district: user.district ?? "",
    subDistrict: user.subDistrict ?? "",
    city: user.city ?? "",
    village: user.village ?? "",
    street: user.street ?? "",
    postalCode: user.postalCode ?? "",
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  // Non-super admins may not change a user who already holds an admin role.
  const roleLocked = !isSuperAdmin && isAdmin(user.role as UserRole);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Build payload — only send changed/non-empty values to keep diff small
      const payload: Record<string, unknown> = {};
      // Account
      if (form.name !== (user.name ?? "")) payload.name = form.name || null;
      if (form.firstName !== (user.firstName ?? ""))
        payload.firstName = form.firstName || null;
      if (form.lastName !== (user.lastName ?? ""))
        payload.lastName = form.lastName || null;
      if (form.email !== user.email) payload.email = form.email;
      if (form.username !== (user.username ?? ""))
        payload.username = form.username || null;
      if (form.password) payload.password = form.password;
      if (form.phone !== (user.phone ?? "")) payload.phone = form.phone || null;
      if (form.role !== user.role) payload.role = form.role;
      if (form.status !== user.status) payload.status = form.status;
      // Balance
      if (form.level !== user.level) payload.level = Number(form.level);
      if (form.xp !== user.xp) payload.xp = Number(form.xp);
      if (form.pointsBalance !== user.pointsBalance)
        payload.pointsBalance = Number(form.pointsBalance);
      if (form.cashBalance !== user.cashBalance)
        payload.cashBalance = Number(form.cashBalance);
      if (form.packageId !== (user.packageId ?? ""))
        payload.packageId = form.packageId || null;
      const newExp = form.packageExpiresAt
        ? new Date(form.packageExpiresAt).toISOString()
        : null;
      const oldExp = user.packageExpiresAt
        ? new Date(user.packageExpiresAt).toISOString()
        : null;
      if (newExp !== oldExp) payload.packageExpiresAt = newExp;
      if (form.kycStatus !== user.kycStatus)
        payload.kycStatus = form.kycStatus;
      if (form.twoFactorEnabled !== user.twoFactorEnabled)
        payload.twoFactorEnabled = form.twoFactorEnabled;
      if (form.tutorSuspended !== user.tutorSuspended)
        payload.tutorSuspended = form.tutorSuspended;
      if (form.isBlueVerified !== user.isBlueVerified)
        payload.isBlueVerified = form.isBlueVerified;
      if (form.verifiedBadgeStyle !== (user.verifiedBadgeStyle ?? "BLUE"))
        payload.verifiedBadgeStyle = form.verifiedBadgeStyle || "BLUE";
      // Personal
      if (form.gender !== (user.gender ?? ""))
        payload.gender = form.gender || null;
      const newDob = form.dateOfBirth
        ? new Date(form.dateOfBirth).toISOString()
        : null;
      const oldDob = user.dateOfBirth
        ? new Date(user.dateOfBirth).toISOString()
        : null;
      if (newDob !== oldDob) payload.dateOfBirth = newDob;
      if (form.nidNumber !== (user.nidNumber ?? ""))
        payload.nidNumber = form.nidNumber || null;
      if (form.profession !== (user.profession ?? ""))
        payload.profession = form.profession || null;
      if (form.maritalStatus !== (user.maritalStatus ?? ""))
        payload.maritalStatus = form.maritalStatus || null;
      if (form.studyLevel !== (user.studyLevel ?? ""))
        payload.studyLevel = form.studyLevel || null;
      if (form.nationality !== (user.nationality ?? ""))
        payload.nationality = form.nationality || null;
      if (form.bloodGroup !== (user.bloodGroup ?? ""))
        payload.bloodGroup = form.bloodGroup || null;
      if (form.secondaryEmail !== (user.secondaryEmail ?? ""))
        payload.secondaryEmail = form.secondaryEmail || null;
      if (form.secondaryPhone !== (user.secondaryPhone ?? ""))
        payload.secondaryPhone = form.secondaryPhone || null;
      if (form.bio !== (user.bio ?? "")) payload.bio = form.bio || null;
      // Photos
      if (form.avatar !== (user.avatar ?? ""))
        payload.avatar = form.avatar || null;
      if (form.coverPhoto !== (user.coverPhoto ?? ""))
        payload.coverPhoto = form.coverPhoto || null;
      // Address
      if (form.country !== (user.country ?? ""))
        payload.country = form.country || null;
      if (form.region !== (user.region ?? ""))
        payload.region = form.region || null;
      if (form.division !== (user.division ?? ""))
        payload.division = form.division || null;
      if (form.subDivision !== (user.subDivision ?? ""))
        payload.subDivision = form.subDivision || null;
      if (form.district !== (user.district ?? ""))
        payload.district = form.district || null;
      if (form.subDistrict !== (user.subDistrict ?? ""))
        payload.subDistrict = form.subDistrict || null;
      if (form.city !== (user.city ?? "")) payload.city = form.city || null;
      if (form.village !== (user.village ?? ""))
        payload.village = form.village || null;
      if (form.street !== (user.street ?? ""))
        payload.street = form.street || null;
      if (form.postalCode !== (user.postalCode ?? ""))
        payload.postalCode = form.postalCode || null;

      // Feature access overrides
      if (
        JSON.stringify(form.featureOverrides) !==
        JSON.stringify(user.featureOverrides ?? {})
      ) {
        payload.featureOverrides = form.featureOverrides;
      }

      if (Object.keys(payload).length === 0) {
        toast.info("No changes to save");
        setSubmitting(false);
        return;
      }

      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success("User updated successfully");
      router.refresh();
      handleDone();
    } catch (err) {
      toast.error("Failed to update user", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-800">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={handleDone}
            className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors shrink-0"
            aria-label="Back"
            title="Back"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white truncate">Edit User</h2>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
          </div>
        </div>
        <span
          className={cn(
            "px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold shrink-0",
            user.role === "SUPER_ADMIN" && "bg-amber-500/15 text-amber-400",
            user.role === "ADMIN" && "bg-purple-500/15 text-purple-400",
            user.role === "USER" && "bg-slate-700 text-slate-300"
          )}
        >
          {user.role}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 pt-3 border-b border-slate-800 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors",
                tab === t.id
                  ? "bg-slate-900 text-white border-b-2 border-blue-500"
                  : "text-slate-400 hover:text-white hover:bg-slate-700/50"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-6 space-y-4"
        >
          {tab === "account" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="First Name">
                  <input
                    value={form.firstName}
                    onChange={(e) => set("firstName", e.target.value)}
                    className={fieldCls}
                  />
                </Field>
                <Field label="Last Name">
                  <input
                    value={form.lastName}
                    onChange={(e) => set("lastName", e.target.value)}
                    className={fieldCls}
                  />
                </Field>
              </div>
              <Field label="Display Name">
                <input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  className={fieldCls}
                />
              </Field>
              <Field label="Username">
                <input
                  value={form.username}
                  onChange={(e) => set("username", e.target.value)}
                  className={fieldCls}
                />
              </Field>
              <Field label="Email *">
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  className={fieldCls}
                />
              </Field>
              <Field
                label="Password (leave empty to keep current)"
                hint="Min 6 chars — saved only when filled"
              >
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                    className={cn(fieldCls, "pr-10 font-mono")}
                    minLength={6}
                    placeholder="Enter a new password to reset it"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-white transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </Field>
              <Field label="Phone">
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  className={fieldCls}
                />
              </Field>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Role">
                  {/* Admin roles are SUPER_ADMIN-only (feature #8) — non-super
                      admins can only set USER/TUTOR and can't touch a user who
                      already holds an admin role. Server enforces this too. */}
                  <select
                    value={form.role}
                    onChange={(e) => set("role", e.target.value)}
                    className={fieldCls}
                    disabled={roleLocked}
                  >
                    <option value="USER">User</option>
                    <option value="TUTOR">Tutor</option>
                    {isSuperAdmin ? (
                      <>
                        <option value="MODERATOR">Moderator</option>
                        <option value="SUPPORT_ADMIN">Support Admin</option>
                        <option value="CONTENT_ADMIN">Content Admin</option>
                        <option value="MARKETING_ADMIN">Marketing Admin</option>
                        <option value="FINANCE_ADMIN">Finance Admin</option>
                        <option value="SUPER_ADMIN">Super Admin</option>
                      </>
                    ) : (
                      // Keep the current admin role visible (read-only) so the
                      // select isn't blank when a non-super admin views it.
                      roleLocked && (
                        <option value={user.role}>
                          {user.role.replace(/_/g, " ")}
                        </option>
                      )
                    )}
                  </select>
                </Field>
                <Field label="Status">
                  <select
                    value={form.status}
                    onChange={(e) => set("status", e.target.value)}
                    className={fieldCls}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="PENDING_VERIFICATION">Pending</option>
                    <option value="SUSPENDED">Suspended</option>
                    <option value="BANNED">Banned</option>
                  </select>
                </Field>
              </div>
            </div>
          )}

          {tab === "verify" && (
            <div className="space-y-5">
              {/* Section 1 — Reset Password */}
              <section className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
                <header className="flex items-start gap-2">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/15 text-blue-300 flex items-center justify-center shrink-0">
                    🔑
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-white">Reset Password</h3>
                    <p className="text-xs text-blue-200/80">
                      Set a new password for this user. Updates on Save Changes.
                    </p>
                  </div>
                </header>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                    className={cn(fieldCls, "pr-24 font-mono")}
                    minLength={6}
                    placeholder="Type a new password or click Generate"
                    autoComplete="new-password"
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {form.password && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(form.password);
                            toast.success("Password copied");
                          } catch {
                            toast.error("Couldn't copy");
                          }
                        }}
                        title="Copy"
                        className="p-1.5 text-slate-400 hover:text-white"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      title={showPassword ? "Hide" : "Show"}
                      className="p-1.5 text-slate-400 hover:text-white"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      set("password", generateRandomPassword());
                      setShowPassword(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold rounded-lg"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Generate random
                  </button>
                  {form.password && (
                    <button
                      type="button"
                      onClick={() => set("password", "")}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">
                  Tell the user securely — they can change it after login at <code>/update-password</code>.
                </p>
              </section>

              {/* Section 2 — KYC Approval */}
              <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                <header className="flex items-start gap-2">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/15 text-emerald-300 flex items-center justify-center shrink-0">
                    🪪
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-white">KYC Verification</h3>
                    <p className="text-xs text-emerald-200/80">
                      Approve or reject the user&apos;s identity verification.
                    </p>
                  </div>
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold",
                      form.kycStatus === "APPROVED" && "bg-emerald-500/20 text-emerald-300",
                      form.kycStatus === "PENDING" && "bg-amber-500/20 text-amber-300",
                      form.kycStatus === "REJECTED" && "bg-red-500/20 text-red-300",
                      form.kycStatus === "NOT_SUBMITTED" && "bg-slate-700 text-slate-300"
                    )}
                  >
                    {form.kycStatus.replace("_", " ")}
                  </span>
                </header>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => set("kycStatus", "APPROVED")}
                    className={cn(
                      "py-2 rounded-lg text-xs font-bold border transition-colors",
                      form.kycStatus === "APPROVED"
                        ? "bg-emerald-500 text-white border-emerald-500"
                        : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20"
                    )}
                  >
                    ✓ Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => set("kycStatus", "PENDING")}
                    className={cn(
                      "py-2 rounded-lg text-xs font-bold border transition-colors",
                      form.kycStatus === "PENDING"
                        ? "bg-amber-500 text-white border-amber-500"
                        : "bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20"
                    )}
                  >
                    ⏱ Pending
                  </button>
                  <button
                    type="button"
                    onClick={() => set("kycStatus", "REJECTED")}
                    className={cn(
                      "py-2 rounded-lg text-xs font-bold border transition-colors",
                      form.kycStatus === "REJECTED"
                        ? "bg-red-500 text-white border-red-500"
                        : "bg-red-500/10 text-red-300 border-red-500/30 hover:bg-red-500/20"
                    )}
                  >
                    ✗ Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => set("kycStatus", "NOT_SUBMITTED")}
                    className={cn(
                      "py-2 rounded-lg text-xs font-bold border transition-colors",
                      form.kycStatus === "NOT_SUBMITTED"
                        ? "bg-slate-600 text-white border-slate-600"
                        : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                    )}
                  >
                    Reset
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Approving KYC unlocks higher withdrawal limits and lets you tick the 🔵 Blue Badge below.
                </p>
              </section>

              {/* Section 3 — Blue Verified */}
              <section
                className={cn(
                  "rounded-xl border p-4 space-y-3",
                  form.isBlueVerified
                    ? "border-sky-500/40 bg-sky-500/10"
                    : "border-slate-700 bg-slate-900/50"
                )}
              >
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isBlueVerified}
                    onChange={(e) => set("isBlueVerified", e.target.checked)}
                    className="w-5 h-5 rounded bg-slate-800 border-slate-600 text-sky-500 focus:ring-sky-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white inline-flex items-center gap-1.5">
                      🔵 Blue Badge Verified
                    </p>
                    <p className="text-xs text-slate-400">
                      Shows the blue checkmark next to the user&apos;s name across the platform.
                    </p>
                  </div>
                </label>
                {form.kycStatus === "APPROVED" && !form.isBlueVerified && (
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 text-[11px] text-amber-200">
                    💡 This user has approved KYC — typically Blue Verified is enabled too.
                  </div>
                )}
                {form.isBlueVerified && form.kycStatus !== "APPROVED" && (
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 text-[11px] text-amber-200">
                    ⚠️ Blue Verified is on but KYC is not approved. Approve KYC above for consistency.
                  </div>
                )}

                {/* Badge style picker — only when verified */}
                {form.isBlueVerified && (
                  <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-300">
                          Badge Style
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Pick a colour. Hover the badge to preview the
                          &quot;Verified&quot; tooltip.
                        </p>
                      </div>
                      <VerifiedBadge
                        style={form.verifiedBadgeStyle as VerifiedBadgeStyle}
                        size="md"
                      />
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
                      {(
                        Object.keys(
                          VERIFIED_BADGE_STYLES
                        ) as VerifiedBadgeStyle[]
                      ).map((id) => {
                        const meta = VERIFIED_BADGE_STYLES[id];
                        const active = form.verifiedBadgeStyle === id;
                        return (
                          <button
                            type="button"
                            key={id}
                            onClick={() => set("verifiedBadgeStyle", id)}
                            className={cn(
                              "flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-all",
                              active
                                ? "border-white bg-slate-800 ring-2 ring-white/30"
                                : "border-slate-700 bg-slate-900 hover:border-slate-600"
                            )}
                            title={meta.label}
                          >
                            <VerifiedBadge style={id} size="md" />
                            <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wider">
                              {meta.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              {/* Section — Two-Factor Authentication (admin can only disable) */}
              <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                <h3 className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">
                  Two-Factor Authentication
                </h3>
                {form.twoFactorEnabled ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-slate-300">
                      2FA is <span className="text-emerald-400 font-semibold">enabled</span> for this user.
                    </p>
                    <button
                      type="button"
                      onClick={() => set("twoFactorEnabled", false)}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 text-xs font-semibold hover:bg-red-500/20 transition-colors"
                    >
                      Disable 2FA
                    </button>
                  </div>
                ) : user.twoFactorEnabled ? (
                  <p className="text-sm text-amber-400">
                    2FA will be disabled and the secret cleared on save. The user
                    must re-enroll.
                  </p>
                ) : (
                  <p className="text-sm text-slate-500">
                    2FA is not enabled. Admins can only disable/reset it, never
                    force-enable.
                  </p>
                )}
              </section>

              {/* Section 4 — Quick References */}
              <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                <h3 className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">
                  Reference
                </h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <dt className="text-slate-500 shrink-0">Display ID:</dt>
                    <dd className="text-white font-mono font-bold truncate">
                      {userDisplayId(user.id)}
                    </dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <dt className="text-slate-500 shrink-0">Internal ID:</dt>
                    <dd className="text-slate-400 font-mono truncate text-[10px]">
                      {user.id}
                    </dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <dt className="text-slate-500 shrink-0">Email:</dt>
                    <dd className="text-slate-300 truncate">{user.email}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <dt className="text-slate-500 shrink-0">Role:</dt>
                    <dd className="text-slate-300">{user.role}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <dt className="text-slate-500 shrink-0">Status:</dt>
                    <dd className="text-slate-300">{user.status}</dd>
                  </div>
                </dl>
              </section>
            </div>
          )}

          {tab === "balance" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Level (1-100)">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={form.level}
                    onChange={(e) => set("level", Number(e.target.value))}
                    className={fieldCls}
                  />
                </Field>
                <Field label="XP">
                  <input
                    type="number"
                    min={0}
                    value={form.xp}
                    onChange={(e) => set("xp", Number(e.target.value))}
                    className={fieldCls}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Points Balance">
                  <input
                    type="number"
                    min={0}
                    value={form.pointsBalance}
                    onChange={(e) =>
                      set("pointsBalance", Number(e.target.value))
                    }
                    className={fieldCls}
                  />
                </Field>
                <Field label="Cash Balance ($)">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.cashBalance}
                    onChange={(e) =>
                      set("cashBalance", Number(e.target.value))
                    }
                    className={fieldCls}
                  />
                </Field>
              </div>
              <p className="text-xs text-slate-500">
                Tip: For audited adjustments, use the ± buttons on the user
                detail page (creates a transaction record).
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Plan">
                  <select
                    value={form.packageId}
                    onChange={(e) => set("packageId", e.target.value)}
                    className={fieldCls}
                  >
                    <option value="">— None —</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="KYC Status">
                  <select
                    value={form.kycStatus}
                    onChange={(e) => set("kycStatus", e.target.value)}
                    className={fieldCls}
                  >
                    <option value="NOT_SUBMITTED">Not Submitted</option>
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approved (Verified)</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </Field>
                <Field label="Plan Expiry">
                  <input
                    type="date"
                    value={form.packageExpiresAt}
                    onChange={(e) => set("packageExpiresAt", e.target.value)}
                    className={fieldCls}
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Blank = no expiry. After this date the user falls back to the
                    default plan.
                  </p>
                </Field>
              </div>
              <label className="flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-900 border border-slate-700 cursor-pointer hover:border-slate-600">
                <input
                  type="checkbox"
                  checked={form.isBlueVerified}
                  onChange={(e) => set("isBlueVerified", e.target.checked)}
                  className="rounded bg-slate-800 border-slate-600 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm text-white">
                  🔵 Blue Badge Verified
                </span>
                <span className="ml-auto text-xs text-slate-500">
                  Visible next to user&apos;s name
                </span>
              </label>
            </div>
          )}

          {tab === "photos" && (
            <div className="space-y-5">
              <p className="text-xs text-slate-400">
                Upload images on this user&apos;s behalf. Stored on S3 and visible
                on their public profile. Max 8&nbsp;MB each.
              </p>
              <PhotoField
                label="Profile photo (avatar)"
                kind="avatar"
                value={form.avatar}
                onChange={(url) => set("avatar", url ?? "")}
              />
              <PhotoField
                label="Cover photo"
                kind="coverPhoto"
                value={form.coverPhoto}
                onChange={(url) => set("coverPhoto", url ?? "")}
              />
            </div>
          )}

          {tab === "personal" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Gender">
                  <select
                    value={form.gender}
                    onChange={(e) => set("gender", e.target.value)}
                    className={fieldCls}
                  >
                    <option value="">—</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </Field>
                <Field label="Date of Birth">
                  <input
                    type="date"
                    value={form.dateOfBirth}
                    onChange={(e) => set("dateOfBirth", e.target.value)}
                    className={fieldCls}
                  />
                </Field>
              </div>
              <Field label="National ID Number">
                <input
                  value={form.nidNumber}
                  onChange={(e) => set("nidNumber", e.target.value)}
                  className={fieldCls}
                />
              </Field>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Profession">
                  <select
                    value={form.profession}
                    onChange={(e) => set("profession", e.target.value)}
                    className={fieldCls}
                  >
                    <option value="">—</option>
                    {PROFESSIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Marital Status">
                  <select
                    value={form.maritalStatus}
                    onChange={(e) => set("maritalStatus", e.target.value)}
                    className={fieldCls}
                  >
                    <option value="">—</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Divorced">Divorced</option>
                    <option value="Widowed">Widowed</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Study Level">
                  <select
                    value={form.studyLevel}
                    onChange={(e) => set("studyLevel", e.target.value)}
                    className={fieldCls}
                  >
                    <option value="">—</option>
                    <option value="School">School</option>
                    <option value="College">College</option>
                    <option value="University">University</option>
                    <option value="Not study right now">Not study right now</option>
                  </select>
                </Field>
                <Field label="Nationality">
                  <input
                    value={form.nationality}
                    onChange={(e) => set("nationality", e.target.value)}
                    className={fieldCls}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Blood Group">
                  <select
                    value={form.bloodGroup}
                    onChange={(e) => set("bloodGroup", e.target.value)}
                    className={fieldCls}
                  >
                    <option value="">—</option>
                    <option>A+</option>
                    <option>A-</option>
                    <option>B+</option>
                    <option>B-</option>
                    <option>AB+</option>
                    <option>AB-</option>
                    <option>O+</option>
                    <option>O-</option>
                  </select>
                </Field>
                <Field label="Secondary Email">
                  <input
                    type="email"
                    value={form.secondaryEmail}
                    onChange={(e) => set("secondaryEmail", e.target.value)}
                    className={fieldCls}
                  />
                </Field>
              </div>
              <Field label="Secondary Phone">
                <input
                  type="tel"
                  value={form.secondaryPhone}
                  onChange={(e) => set("secondaryPhone", e.target.value)}
                  className={fieldCls}
                />
              </Field>
              <Field label="Bio">
                <textarea
                  rows={3}
                  value={form.bio}
                  onChange={(e) => set("bio", e.target.value)}
                  className={fieldCls + " resize-none"}
                  maxLength={500}
                />
              </Field>
            </div>
          )}

          {tab === "address" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Country">
                  <input
                    value={form.country}
                    onChange={(e) => set("country", e.target.value)}
                    className={fieldCls}
                    placeholder="Bangladesh"
                  />
                </Field>
                <Field label="Region">
                  <input
                    value={form.region}
                    onChange={(e) => set("region", e.target.value)}
                    className={fieldCls}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Division">
                  <input
                    value={form.division}
                    onChange={(e) => set("division", e.target.value)}
                    className={fieldCls}
                  />
                </Field>
                <Field label="Sub Division">
                  <input
                    value={form.subDivision}
                    onChange={(e) => set("subDivision", e.target.value)}
                    className={fieldCls}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="District">
                  <input
                    value={form.district}
                    onChange={(e) => set("district", e.target.value)}
                    className={fieldCls}
                  />
                </Field>
                <Field label="Sub District">
                  <input
                    value={form.subDistrict}
                    onChange={(e) => set("subDistrict", e.target.value)}
                    className={fieldCls}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="City">
                  <input
                    value={form.city}
                    onChange={(e) => set("city", e.target.value)}
                    className={fieldCls}
                  />
                </Field>
                <Field label="Village">
                  <input
                    value={form.village}
                    onChange={(e) => set("village", e.target.value)}
                    className={fieldCls}
                  />
                </Field>
              </div>
              <Field label="Street">
                <input
                  value={form.street}
                  onChange={(e) => set("street", e.target.value)}
                  className={fieldCls}
                />
              </Field>
              <Field label="Postal Code">
                <input
                  value={form.postalCode}
                  onChange={(e) => set("postalCode", e.target.value)}
                  className={fieldCls}
                />
              </Field>
            </div>
          )}

          {tab === "access" && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Override this user&apos;s feature access. <b>Default</b> follows
                their plan; <b>On</b>/<b>Off</b> force it regardless of package.
              </p>
              {(["creator", "section", "task"] as const).map((grp) => (
                <div key={grp} className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                    {grp === "creator"
                      ? "Creator Access"
                      : grp === "section"
                        ? "Sections"
                        : "Task categories"}
                  </p>
                  {FEATURES.filter((f) => f.group === grp).map((f) => {
                    const cur = form.featureOverrides[f.key];
                    const setOv = (val: boolean | null) => {
                      const next = { ...form.featureOverrides };
                      if (val === null) delete next[f.key];
                      else next[f.key] = val;
                      set("featureOverrides", next);
                    };
                    const opts: Array<{ lbl: string; val: boolean | null }> = [
                      { lbl: "Default", val: null },
                      { lbl: "On", val: true },
                      { lbl: "Off", val: false },
                    ];
                    return (
                      <div
                        key={f.key}
                        className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-950/50 border border-slate-800"
                      >
                        <span className="text-sm text-white">{f.label}</span>
                        <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden text-xs font-semibold shrink-0">
                          {opts.map(({ lbl, val }) => {
                            const active =
                              val === null ? cur === undefined : cur === val;
                            return (
                              <button
                                key={lbl}
                                type="button"
                                onClick={() => setOv(val)}
                                className={cn(
                                  "px-3 py-1.5 transition-colors",
                                  active
                                    ? val === true
                                      ? "bg-emerald-500 text-white"
                                      : val === false
                                        ? "bg-red-500 text-white"
                                        : "bg-slate-700 text-white"
                                    : "text-slate-400 hover:text-white"
                                )}
                              >
                                {lbl}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {/* Tutor sell-courses suspension — a per-user creator-access
                      lever distinct from the sellCourses capability grant. Only
                      meaningful once the user actually has a TutorProfile. */}
                  {grp === "creator" && user.hasTutorProfile && (
                    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-950/50 border border-slate-800">
                      <span className="text-sm text-white">
                        Suspend selling (Tutor)
                      </span>
                      <button
                        type="button"
                        onClick={() => set("tutorSuspended", !form.tutorSuspended)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0",
                          form.tutorSuspended
                            ? "bg-red-500 text-white"
                            : "bg-slate-700 text-slate-200 hover:bg-slate-600"
                        )}
                      >
                        {form.tutorSuspended ? "Suspended" : "Active"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </form>

        {/* Sticky footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-800 sticky bottom-0 bg-slate-900">
          <button
            type="button"
            onClick={handleDone}
            className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>
  );
}

const fieldCls =
  "w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">
        {label}
        {hint && <span className="text-slate-600 ml-2">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function PhotoField({
  label,
  kind,
  value,
  onChange,
}: {
  label: string;
  kind: "avatar" | "coverPhoto";
  value: string;
  onChange: (url: string | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Image must be under 8 MB");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: fd,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      const url = d.cloudFrontUrl || d.url || d.s3Url;
      if (!url) throw new Error("Upload returned no URL");
      onChange(url);
      toast.success(`${kind === "avatar" ? "Profile" : "Cover"} photo uploaded`);
    } catch (err) {
      toast.error("Upload failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
        {label}
      </p>

      {value && (
        <div
          className={cn(
            "relative rounded-lg overflow-hidden border border-slate-700 bg-slate-950 mb-3",
            kind === "avatar"
              ? "w-32 h-32 rounded-full"
              : "w-full aspect-[5/2]"
          )}
        >
          <SmartImage src={value} alt="" fill sizes="128px" className="object-cover" />
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !busy && fileInputRef.current?.click()}
        className={cn(
          "rounded-xl border-2 border-dashed p-4 cursor-pointer text-center transition-colors",
          dragOver
            ? "border-blue-500 bg-blue-500/5"
            : "border-slate-700 hover:border-blue-500/50 hover:bg-slate-950"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        {busy ? (
          <div className="inline-flex items-center gap-2 text-slate-300">
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading...
          </div>
        ) : (
          <>
            {value ? (
              <Camera className="w-6 h-6 text-slate-500 mx-auto mb-1" />
            ) : (
              <ImageIcon className="w-7 h-7 text-slate-500 mx-auto mb-1" />
            )}
            <p className="text-sm text-white font-semibold">
              {value ? "Replace image" : "Click or drag image here"}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              JPG, PNG, WebP, GIF · Up to 8 MB
            </p>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 mt-2">
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="...or paste a URL"
          className="flex-1 px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-md text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={busy}
            className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
            title="Remove photo"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
