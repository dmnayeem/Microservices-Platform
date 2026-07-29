"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Shield,
  Loader2,
  Users,
  Twitter,
  Sparkles,
  CheckCircle,
  Edit3,
  Trash2,
  Plus,
  Lock,
  ChevronRight,
  CreditCard,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LocationSelector } from "@/components/shared/location-selector";
import {
  useTheme,
  ACCENTS,
  ACCENT_HEX,
  ACCENT_GRADIENT,
  type Theme,
  type Accent,
} from "@/components/providers/theme-provider";
import type { ProfileResponse, SocialAccount } from "./profile-view.types";
import { LANGUAGES, PLATFORM_META, inp } from "./profile-view.constants";
import { Card, Field, UsernameField, StatTile, Toggle } from "./profile-ui";
import { VerifiedAccountsCard } from "./verified-accounts-card";

export function PersonalTab({
  data,
  patch,
}: {
  data: ProfileResponse;
  patch: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const { profile } = data;
  const [form, setForm] = useState({
    firstName: profile.firstName ?? "",
    lastName: profile.lastName ?? "",
    username: profile.username ?? "",
    bio: profile.bio ?? "",
    gender: profile.gender ?? "",
    dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.slice(0, 10) : "",
    nidNumber: profile.nidNumber ?? "",
    profession: profile.profession ?? "",
    nationality: profile.nationality ?? "",
    bloodGroup: profile.bloodGroup ?? "",
    phone: profile.phone ?? "",
    secondaryEmail: profile.secondaryEmail ?? "",
    secondaryPhone: profile.secondaryPhone ?? "",
    language: profile.language,
    timezone: profile.timezone,
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    await patch({
      firstName: form.firstName || null,
      lastName: form.lastName || null,
      username: form.username || null,
      bio: form.bio || null,
      gender: form.gender || null,
      dateOfBirth: form.dateOfBirth || null,
      nidNumber: form.nidNumber || null,
      profession: form.profession || null,
      nationality: form.nationality || null,
      bloodGroup: form.bloodGroup || null,
      phone: form.phone || null,
      secondaryEmail: form.secondaryEmail || null,
      secondaryPhone: form.secondaryPhone || null,
      language: form.language,
      timezone: form.timezone,
    });
    setBusy(false);
  };

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  return (
    <Card title="Personal Info">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="First Name">
          <input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className={inp} />
        </Field>
        <Field label="Last Name">
          <input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className={inp} />
        </Field>
        <UsernameField
          value={form.username}
          onChange={(v) => set("username", v)}
          currentUsername={profile.username ?? null}
        />
        <Field label="Date of Birth">
          <input type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} className={inp} />
        </Field>
        <Field label="Gender">
          <select value={form.gender} onChange={(e) => set("gender", e.target.value)} className={inp}>
            <option value="">—</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>
        <Field label="National ID / Passport">
          <input value={form.nidNumber} onChange={(e) => set("nidNumber", e.target.value)} className={inp} />
        </Field>
        <Field label="Profession">
          <input value={form.profession} onChange={(e) => set("profession", e.target.value)} className={inp} />
        </Field>
        <Field label="Nationality">
          <input value={form.nationality} onChange={(e) => set("nationality", e.target.value)} className={inp} />
        </Field>
        <Field label="Blood Group">
          <select value={form.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)} className={inp}>
            <option value="">—</option>
            {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </Field>
        <Field label="Language">
          <select value={form.language} onChange={(e) => set("language", e.target.value)} className={inp}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Phone">
          <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+880 1234 567890" className={inp} />
        </Field>
        <Field label="Secondary Phone">
          <input type="tel" value={form.secondaryPhone} onChange={(e) => set("secondaryPhone", e.target.value)} className={inp} />
        </Field>
        <Field label="Secondary Email">
          <input type="email" value={form.secondaryEmail} onChange={(e) => set("secondaryEmail", e.target.value)} className={inp} />
        </Field>
        <Field label="Timezone">
          <input value={form.timezone} onChange={(e) => set("timezone", e.target.value)} placeholder="Asia/Dhaka" className={inp} />
        </Field>
      </div>
      <Field label="Bio (about you)">
        <textarea
          rows={3}
          value={form.bio}
          onChange={(e) => set("bio", e.target.value)}
          maxLength={500}
          placeholder="A short intro that appears on your public profile."
          className={inp}
        />
      </Field>
      <div className="flex justify-end pt-2">
        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold rounded-lg disabled:opacity-50"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Save Changes
        </button>
      </div>
    </Card>
  );
}

export function AddressTab({
  data,
  patch,
}: {
  data: ProfileResponse;
  patch: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const { address } = data;
  const [form, setForm] = useState({
    street: address.street ?? "",
    village: address.village ?? "",
    city: address.city ?? "",
    subDistrict: address.subDistrict ?? "",
    district: address.district ?? "",
    subDivision: "",
    division: address.division ?? "",
    region: address.region ?? "",
    postalCode: address.postalCode ?? "",
    country: address.country ?? "",
  });
  const [busy, setBusy] = useState(false);

  return (
    <Card title="Address">
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
        onChange={(p) =>
          setForm((prev) => ({
            ...prev,
            ...Object.fromEntries(
              Object.entries(p).map(([k, v]) => [k, v ?? ""])
            ),
          }))
        }
      />
      <div className="flex justify-end pt-3">
        <button
          onClick={async () => {
            setBusy(true);
            const { subDivision: _sub, ...payload } = form;
            void _sub;
            await patch(payload);
            setBusy(false);
          }}
          disabled={busy}
          className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold rounded-lg disabled:opacity-50"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Save Address
        </button>
      </div>
    </Card>
  );
}

export function KycTab({ data }: { data: ProfileResponse }) {
  const { verification } = data;
  return (
    <Card title="KYC Verification">
      <div className="rounded-lg p-3 border border-gray-800 bg-gray-950 mb-4">
        <p className="text-xs text-gray-400 uppercase tracking-wider font-bold">Status</p>
        <p
          className={cn(
            "text-base font-bold mt-0.5",
            verification.kycStatus === "APPROVED" && "text-emerald-400",
            verification.kycStatus === "PENDING" && "text-amber-400",
            verification.kycStatus === "REJECTED" && "text-red-400",
            (!verification.kycStatus || verification.kycStatus === "NOT_SUBMITTED") && "text-gray-300"
          )}
        >
          {verification.kycStatus === "APPROVED"
            ? "✅ Approved — Blue verified"
            : verification.kycStatus === "PENDING"
            ? "⏱ Pending review"
            : verification.kycStatus === "REJECTED"
            ? "❌ Rejected"
            : "Not submitted"}
        </p>
      </div>

      <p className="text-sm text-gray-400 mb-4">
        Submit a government-issued ID (front + back) and a selfie to verify your identity.
        Approved KYC unlocks higher withdrawal limits and the blue 🔵 badge.
      </p>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/kyc"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold"
        >
          <Shield className="w-4 h-4" />
          {verification.kycStatus === "NOT_SUBMITTED" || !verification.kycStatus
            ? "Submit KYC"
            : "Manage KYC"}
        </Link>
        {verification.kycStatus === "REJECTED" && (
          <Link
            href="/kyc/appeal"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-sm font-bold border border-amber-500/30"
          >
            Appeal Rejection →
          </Link>
        )}
      </div>
    </Card>
  );
}

export function SocialTab({
  accounts,
  onConnect,
  onDisconnect,
}: {
  accounts: SocialAccount[];
  onConnect: (p: SocialAccount["platform"]) => void;
  onDisconnect: (id: string) => void;
}) {
  const totalFollowers = useMemo(
    () => accounts.reduce((s, a) => s + a.followers, 0),
    [accounts]
  );
  const totalPosts = useMemo(
    () => accounts.reduce((s, a) => s + a.postsCount, 0),
    [accounts]
  );

  return (
    <div className="space-y-4">
      {accounts.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatTile icon={<Users className="w-4 h-4" />} label="Total followers" value={totalFollowers.toLocaleString()} tone="indigo" />
          <StatTile icon={<Twitter className="w-4 h-4" />} label="Connected" value={`${accounts.length} / 8`} tone="purple" />
          <StatTile icon={<Sparkles className="w-4 h-4" />} label="Total posts" value={totalPosts.toLocaleString()} tone="amber" />
        </div>
      )}

      <Card title="Connected Accounts">
        <p className="text-xs text-gray-400 mb-3">
          Connect your social profiles to show your reach. Follower counts are user-entered for now;
          admin can verify them to lock the badge.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(Object.keys(PLATFORM_META) as SocialAccount["platform"][]).map((platform) => {
            const meta = PLATFORM_META[platform];
            const account = accounts.find((a) => a.platform === platform);
            return (
              <div
                key={platform}
                className={cn(
                  "rounded-xl border p-3 transition-colors",
                  account
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-gray-800 bg-gray-900"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0 bg-linear-to-br",
                      meta.gradient
                    )}
                  >
                    <meta.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white inline-flex items-center gap-1.5">
                      {meta.label}
                      {account?.verified && (
                        <CheckCircle className="w-3.5 h-3.5 text-blue-400 fill-blue-500/30" />
                      )}
                    </p>
                    {account ? (
                      <p className="text-[11px] text-gray-400">@{account.username}</p>
                    ) : (
                      <p className="text-[11px] text-gray-500">Not connected</p>
                    )}
                  </div>
                  {account ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onConnect(platform)}
                        className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded"
                        title="Edit"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDisconnect(account.id)}
                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded"
                        title="Disconnect"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onConnect(platform)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold"
                    >
                      <Plus className="w-3 h-3" />
                      Connect
                    </button>
                  )}
                </div>
                {account && (
                  <div className="grid grid-cols-3 gap-1 mt-3 text-center text-[11px]">
                    <div className="rounded bg-gray-950 py-1.5">
                      <p className="text-white font-bold tabular-nums">
                        {account.followers.toLocaleString()}
                      </p>
                      <p className="text-gray-500">{meta.countLabel}</p>
                    </div>
                    <div className="rounded bg-gray-950 py-1.5">
                      <p className="text-white font-bold tabular-nums">
                        {account.following.toLocaleString()}
                      </p>
                      <p className="text-gray-500">Following</p>
                    </div>
                    <div className="rounded bg-gray-950 py-1.5">
                      <p className="text-white font-bold tabular-nums">
                        {account.postsCount.toLocaleString()}
                      </p>
                      <p className="text-gray-500">Posts</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
      <VerifiedAccountsCard />
    </div>
  );
}

export function PrivacyTab({
  privacy,
  patch,
}: {
  privacy: { avatar: string; bio: string; stats: string; earnings: string; location: string };
  patch: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const fields: { key: keyof typeof privacy; label: string; hint: string }[] = [
    { key: "avatar", label: "Profile photo", hint: "Who can see your avatar" },
    { key: "bio", label: "Bio", hint: "Who can see your about-me" },
    { key: "stats", label: "Stats", hint: "Level, points balance, total earnings" },
    { key: "earnings", label: "Earnings", hint: "Lifetime earnings detail" },
    { key: "location", label: "Location", hint: "City / country shown on profile" },
  ];

  return (
    <Card title="Privacy Settings">
      <div className="space-y-2">
        {fields.map((f) => (
          <div
            key={f.key}
            className="flex items-center gap-3 p-3 rounded-lg bg-gray-950 border border-gray-800"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white">{f.label}</p>
              <p className="text-xs text-gray-500">{f.hint}</p>
            </div>
            <select
              value={privacy[f.key]}
              onChange={(e) => patch({ [`privacy${f.key.charAt(0).toUpperCase()}${f.key.slice(1)}`]: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="PUBLIC">Public</option>
              <option value="FRIENDS">Friends</option>
              <option value="PRIVATE">Private</option>
            </select>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-800">
        <a
          href="/api/profile/export"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold"
        >
          ⬇️ Download My Data
        </a>
        <button
          onClick={() => toast.info("Account deletion request goes to support — open a ticket from /help.")}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-semibold border border-red-500/30"
        >
          🗑 Delete Account
        </button>
      </div>
    </Card>
  );
}

export function ThemeTab({
  preferences,
  patch,
}: {
  preferences: { theme: string; themeAccent: string; notifications: { enabled: boolean; email: boolean; push: boolean } };
  patch: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const { setTheme, setAccent } = useTheme();

  const applyTheme = (mode: Theme) => {
    setTheme(mode); // provider resolves "system" (OS-reactive) + persists
    patch({ theme: mode });
  };

  const applyAccent = (id: Accent) => {
    setAccent(id);
    patch({ themeAccent: id });
  };

  return (
    <div className="space-y-4">
      <Card title="Appearance">
        <p className="text-xs text-gray-400 uppercase tracking-wider font-bold mb-2">Mode</p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { id: "dark", label: "Dark", style: { backgroundColor: "#0f172a" } },
              { id: "light", label: "Light", style: { backgroundColor: "#f1f5f9" } },
              {
                id: "system",
                label: "System",
                style: { backgroundImage: "linear-gradient(135deg,#f1f5f9 50%,#0f172a 50%)" },
              },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => applyTheme(t.id)}
              className={cn(
                "p-3 rounded-lg border text-sm font-semibold transition-colors flex flex-col items-center gap-2",
                preferences.theme === t.id
                  ? "bg-indigo-500/15 text-white border-indigo-500/50 ring-1 ring-indigo-500/40"
                  : "bg-gray-900 text-gray-300 border-gray-800 hover:border-gray-700"
              )}
            >
              <span
                className="w-10 h-10 rounded-lg border border-white/10 shadow-inner"
                style={t.style}
              />
              {t.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-gray-400 uppercase tracking-wider font-bold mt-4 mb-2">Accent Color</p>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((id) => (
            <button
              key={id}
              onClick={() => applyAccent(id)}
              style={{ background: ACCENT_GRADIENT[id] ?? ACCENT_HEX[id] }}
              className={cn(
                "w-9 h-9 rounded-full ring-2 ring-offset-2 ring-offset-gray-900 transition-all capitalize",
                preferences.themeAccent === id ? "ring-white" : "ring-transparent"
              )}
              title={id}
            />
          ))}
        </div>
      </Card>

      <Card title="Notifications">
        <Toggle
          label="All notifications"
          hint="Master switch — turning this off silences everything"
          checked={preferences.notifications.enabled}
          onChange={(v) => patch({ notificationsEnabled: v })}
        />
        <Toggle
          label="Email"
          hint="Important account updates by email"
          checked={preferences.notifications.email}
          onChange={(v) => patch({ emailNotifications: v })}
        />
        <Toggle
          label="Push"
          hint="In-app + browser push when available"
          checked={preferences.notifications.push}
          onChange={(v) => patch({ pushNotifications: v })}
        />
      </Card>
    </div>
  );
}

export function SecurityTab({
  verification,
}: {
  verification: { twoFactorEnabled: boolean; isEmailVerified: boolean };
}) {
  return (
    <Card title="Security & Password">
      <div className="space-y-3">
        <Link
          href="/update-password"
          className="flex items-center gap-3 p-3 rounded-lg bg-gray-950 border border-gray-800 hover:border-indigo-500/40 transition-colors"
        >
          <Lock className="w-4 h-4 text-indigo-400" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white">Change Password</p>
            <p className="text-xs text-gray-500">Use a strong password unique to this account</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-600" />
        </Link>

        <Link
          href="/2fa-setup"
          className="flex items-center gap-3 p-3 rounded-lg bg-gray-950 border border-gray-800 hover:border-indigo-500/40 transition-colors"
        >
          <Shield className="w-4 h-4 text-emerald-400" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white">Two-Factor Authentication</p>
            <p className="text-xs text-gray-500">
              {verification.twoFactorEnabled ? "Enabled — manage backup codes" : "Add an extra layer with TOTP"}
            </p>
          </div>
          <span
            className={cn(
              "text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded",
              verification.twoFactorEnabled ? "bg-emerald-500/15 text-emerald-400" : "bg-gray-800 text-gray-400"
            )}
          >
            {verification.twoFactorEnabled ? "On" : "Off"}
          </span>
        </Link>

        <Link
          href="/payment-methods"
          className="flex items-center gap-3 p-3 rounded-lg bg-gray-950 border border-gray-800 hover:border-indigo-500/40 transition-colors"
        >
          <CreditCard className="w-4 h-4 text-amber-400" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white">Payment Methods</p>
            <p className="text-xs text-gray-500">Manage payout destinations</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-600" />
        </Link>

        <Link
          href="/notifications"
          className="flex items-center gap-3 p-3 rounded-lg bg-gray-950 border border-gray-800 hover:border-indigo-500/40 transition-colors"
        >
          <Bell className="w-4 h-4 text-purple-400" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white">Notifications inbox</p>
            <p className="text-xs text-gray-500">View account & system messages</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-600" />
        </Link>
      </div>
    </Card>
  );
}
