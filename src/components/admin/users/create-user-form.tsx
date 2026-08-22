"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Eye,
  EyeOff,
  Sparkles,
  Copy,
  UserPlus,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { LocationSelector } from "@/components/shared/location-selector";
import { DateField } from "@/components/ui/date-field";

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

function generateRandomPassword(length = 12): string {
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%^&*?";
  const all = lower + upper + digits + symbols;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const required = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () =>
    pick(all)
  );
  return [...required, ...rest].sort(() => Math.random() - 0.5).join("");
}

type Tab = "account" | "personal" | "address";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "account", label: "Account" },
  { id: "personal", label: "Personal Info" },
  { id: "address", label: "Address" },
];

interface Props {
  isSuperAdmin: boolean;
}

export function CreateUserForm({ isSuperAdmin }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("account");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({
    // Account (email + password required)
    email: "",
    password: "",
    name: "",
    firstName: "",
    lastName: "",
    username: "",
    phone: "",
    role: "USER",
    status: "ACTIVE",
    packageTier: "FREE",
    // Personal
    gender: "",
    dateOfBirth: "",
    nidNumber: "",
    profession: "",
    maritalStatus: "",
    studyLevel: "",
    nationality: "",
    bloodGroup: "",
    secondaryEmail: "",
    secondaryPhone: "",
    bio: "",
    // Address
    country: "",
    region: "",
    division: "",
    subDivision: "",
    district: "",
    subDistrict: "",
    city: "",
    village: "",
    street: "",
    postalCode: "",
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const validate = (): string | null => {
    if (!form.email.trim()) return "Email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Invalid email";
    if (!form.password) return "Password is required";
    if (form.password.length < 8) return "Password must be at least 8 characters";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast.error(err);
      // jump to the tab where the issue is
      if (
        err.toLowerCase().includes("email") ||
        err.toLowerCase().includes("password")
      ) {
        setTab("account");
      }
      return;
    }

    setSubmitting(true);
    try {
      // Build payload — strip empties so the API uses defaults / nulls
      const payload: Record<string, unknown> = {
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        status: form.status,
        packageTier: form.packageTier,
      };
      const optionalKeys: Array<keyof typeof form> = [
        "name",
        "firstName",
        "lastName",
        "username",
        "phone",
        "gender",
        "nidNumber",
        "profession",
        "maritalStatus",
        "studyLevel",
        "nationality",
        "bloodGroup",
        "secondaryEmail",
        "secondaryPhone",
        "bio",
        "country",
        "region",
        "division",
        "subDivision",
        "district",
        "subDistrict",
        "city",
        "village",
        "street",
        "postalCode",
      ];
      for (const k of optionalKeys) {
        const v = (form[k] as string).trim();
        if (v) payload[k] = v;
      }
      if (form.dateOfBirth) {
        payload.dateOfBirth = new Date(form.dateOfBirth).toISOString();
      }

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("User created successfully");
      router.push("/admin/users");
      router.refresh();
    } catch (err) {
      toast.error("Failed to create user", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
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
        className="p-6 space-y-4 max-h-[70vh] overflow-y-auto"
      >
        {/* ── Account ─────────────────────────────────────────────────────── */}
        {tab === "account" && (
          <div className="space-y-4">
            <Field label="Email *" hint="Used to log in">
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                className={fieldCls}
                autoComplete="off"
                autoFocus
              />
            </Field>

            <Field label="Password *" hint="Min 8 characters">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  className={cn(fieldCls, "pr-24 font-mono")}
                  placeholder="Type a password or click Generate"
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
              <button
                type="button"
                onClick={() => {
                  set("password", generateRandomPassword());
                  setShowPassword(true);
                }}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold rounded-lg"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Generate random
              </button>
            </Field>

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

            <Field
              label="Display Name"
              hint="Auto-generated from first/last/email if empty"
            >
              <input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className={fieldCls}
              />
            </Field>

            <Field label="Username" hint="Unique handle, optional">
              <input
                value={form.username}
                onChange={(e) => set("username", e.target.value)}
                className={fieldCls}
                autoComplete="off"
              />
            </Field>

            <Field label="Phone">
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                className={fieldCls}
              />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Role">
                <select
                  value={form.role}
                  onChange={(e) => set("role", e.target.value)}
                  className={fieldCls}
                >
                  <option value="USER">User</option>
                  {isSuperAdmin && (
                    <>
                      <option value="ADMIN">Admin</option>
                      <option value="MODERATOR">Moderator</option>
                      <option value="SUPPORT_ADMIN">Support Admin</option>
                      <option value="CONTENT_ADMIN">Content Admin</option>
                      <option value="MARKETING_ADMIN">Marketing Admin</option>
                      <option value="FINANCE_ADMIN">Finance Admin</option>
                      <option value="AD_MANAGER">Ad Manager</option>
                      <option value="AGENCY">Agency</option>
                      <option value="SUPER_ADMIN">Super Admin</option>
                    </>
                  )}
                </select>
                {!isSuperAdmin && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Only Super Admin can create non-USER roles.
                  </p>
                )}
              </Field>
              <Field label="Status">
                <select
                  value={form.status}
                  onChange={(e) => set("status", e.target.value)}
                  className={fieldCls}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="PENDING_VERIFICATION">Pending</option>
                </select>
              </Field>
              <Field label="Package">
                <select
                  value={form.packageTier}
                  onChange={(e) => set("packageTier", e.target.value)}
                  className={fieldCls}
                >
                  <option value="FREE">Free</option>
                  <option value="STARTER">Starter</option>
                  <option value="PRO">Pro</option>
                  <option value="ELITE">Elite</option>
                  <option value="VIP">VIP</option>
                </select>
              </Field>
            </div>
          </div>
        )}

        {/* ── Personal ────────────────────────────────────────────────────── */}
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
                <DateField
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(v) => set("dateOfBirth", v)}
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
                  <option value="Not study right now">
                    Not study right now
                  </option>
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
                className={cn(fieldCls, "resize-none")}
                maxLength={500}
              />
            </Field>
          </div>
        )}

        {/* ── Address ─────────────────────────────────────────────────────── */}
        {tab === "address" && (
          <LocationSelector
            value={{
              country: form.country,
              region: form.region,
              division: form.division,
              subDivision: form.subDivision,
              district: form.district,
              subDistrict: form.subDistrict,
              city: form.city,
              village: form.village,
              street: form.street,
              postalCode: form.postalCode,
            }}
            onChange={(patch) =>
              setForm((p) => ({
                ...p,
                ...Object.fromEntries(
                  Object.entries(patch).map(([k, v]) => [k, v ?? ""])
                ),
              }))
            }
          />
        )}
      </form>

      {/* Sticky footer */}
      <div className="flex gap-3 px-6 py-4 border-t border-slate-800 sticky bottom-0 bg-slate-900">
        <button
          type="button"
          onClick={() => router.push("/admin/users")}
          disabled={submitting}
          className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          onClick={handleSubmit}
          disabled={submitting}
          className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 inline-flex items-center justify-center gap-2 font-bold"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <UserPlus className="w-4 h-4" />
          )}
          {submitting ? "Creating…" : "Create User"}
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

