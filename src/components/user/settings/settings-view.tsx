"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { promptDialog } from "@/lib/confirm";
import {
  User,
  Bell,
  Shield,
  Globe,
  Moon,
  Sun,
  Monitor,
  Mail,
  Key,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import {
  useTheme,
  ACCENTS,
  ACCENT_HEX,
  ACCENT_GRADIENT,
  type Theme,
} from "@/components/providers/theme-provider";
import { cn } from "@/lib/utils";

interface Props {
  email: string | null;
  emailNotifications: boolean;
  pushNotifications: boolean;
  twoFactorEnabled: boolean;
  /** False for OAuth-only accounts — they have no password to change. */
  hasPassword: boolean;
  language: string;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-2xl p-4 sm:p-6">
      <div className="mb-6">
        <h3 className="font-semibold text-white">{title}</h3>
        {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input
        type="checkbox"
        className="sr-only peer"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="w-11 h-6 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500 peer-disabled:opacity-50"></div>
    </label>
  );
}

export function SettingsView({
  email,
  emailNotifications: emailNotifInit,
  pushNotifications: pushNotifInit,
  twoFactorEnabled: twoFAInit,
  hasPassword,
  language: languageInit,
}: Props) {
  const router = useRouter();
  const { theme, setTheme, accent, setAccent } = useTheme();
  const [emailNotif, setEmailNotif] = useState(emailNotifInit);
  const [pushNotif, setPushNotif] = useState(pushNotifInit);
  const [twoFA, setTwoFA] = useState(twoFAInit);
  const [language, setLanguage] = useState(languageInit || "en");
  const [savingPref, setSavingPref] = useState(false);

  // Change-password form
  const [showPwForm, setShowPwForm] = useState(false);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  // Delete-account modal
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  const patchProfile = async (data: Record<string, unknown>) => {
    setSavingPref(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      toast.success("Saved");
    } catch (err) {
      toast.error("Couldn't save", {
        description: err instanceof Error ? err.message : "Try again",
      });
      return false;
    } finally {
      setSavingPref(false);
    }
    return true;
  };

  const onEmailNotif = async (v: boolean) => {
    setEmailNotif(v);
    if (!(await patchProfile({ emailNotifications: v }))) setEmailNotif(!v);
  };
  const onPushNotif = async (v: boolean) => {
    setPushNotif(v);
    if (!(await patchProfile({ pushNotifications: v }))) setPushNotif(!v);
  };
  const onLanguage = async (v: string) => {
    const prev = language;
    setLanguage(v);
    if (!(await patchProfile({ language: v }))) setLanguage(prev);
  };
  const applyTheme = (mode: Theme) => {
    setTheme(mode);
    patchProfile({ theme: mode });
  };
  const applyAccent = (id: (typeof ACCENTS)[number]) => {
    setAccent(id);
    patchProfile({ themeAccent: id });
  };

  /**
   * OAuth-only accounts gain a password through the normal reset flow — that
   * already works for them, it was just undiscoverable. This is the discovery.
   */
  const sendPasswordSetup = async () => {
    if (!email) return;
    setPwBusy(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      toast.success("Check your email", {
        description: "We sent a link to set your password.",
      });
    } catch (err) {
      toast.error("Couldn't send the link", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setPwBusy(false);
    }
  };

  const changePassword = async () => {
    if (newPw.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (newPw !== confirmPw) {
      toast.error("Passwords don't match");
      return;
    }
    setPwBusy(true);
    try {
      const res = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: curPw, newPassword: newPw }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      toast.success("Password changed");
      setShowPwForm(false);
      setCurPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err) {
      toast.error("Couldn't change password", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setPwBusy(false);
    }
  };

  const disable2FA = async () => {
    const code = await promptDialog({
      title: "Disable two-factor auth",
      description: "Enter a current 6-digit code to disable 2FA (or leave blank):",
      tone: "danger",
      placeholder: "6-digit code",
      confirmLabel: "Disable 2FA",
    });
    if (code === null) return;
    try {
      const res = await fetch("/api/security/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(code ? { code } : {}),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      setTwoFA(false);
      toast.success("2FA disabled");
    } catch (err) {
      toast.error("Couldn't disable 2FA", {
        description: err instanceof Error ? err.message : "Try again",
      });
    }
  };

  const deleteAccount = async () => {
    if (deleteConfirm !== "DELETE") return;
    setDeleteBusy(true);
    try {
      const res = await fetch("/api/profile", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      toast.success("Account deleted");
      await signOut({ redirect: false });
      router.push("/");
    } catch (err) {
      toast.error("Couldn't delete account", {
        description: err instanceof Error ? err.message : "Try again",
      });
      setDeleteBusy(false);
    }
  };

  const inputCls =
    "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 mt-1">Manage your account settings</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <nav className="space-y-1">
              {[
                { icon: User, label: "Account", href: "#account" },
                { icon: Bell, label: "Notifications", href: "#notifications" },
                { icon: Shield, label: "Security", href: "#security" },
                { icon: Globe, label: "Preferences", href: "#preferences" },
              ].map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {/* Account */}
          <div id="account">
            <Section title="Account" description="Manage your account information">
              <Link
                href="/profile"
                className="flex items-center justify-between py-4 border-b border-gray-800 hover:bg-gray-800/50 -mx-2 px-2 rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-gray-800 rounded-lg">
                    <User className="w-5 h-5 text-gray-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white">Edit Profile</p>
                    <p className="text-sm text-gray-500">Update your name, bio, and avatar</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500" />
              </Link>
              <div className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-gray-800 rounded-lg">
                    <Mail className="w-5 h-5 text-gray-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white">Email Address</p>
                    <p className="text-sm text-gray-500 break-all">{email || "Not set"}</p>
                  </div>
                </div>
                <span className="text-sm text-emerald-400 shrink-0">Verified</span>
              </div>
            </Section>
          </div>

          {/* Notifications */}
          <div id="notifications">
            <Section title="Notifications" description="Configure how you receive notifications">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">Push Notifications</p>
                    <p className="text-sm text-gray-500">Receive notifications on your device</p>
                  </div>
                  <Toggle checked={pushNotif} onChange={onPushNotif} disabled={savingPref} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">Email Notifications</p>
                    <p className="text-sm text-gray-500">Receive updates via email</p>
                  </div>
                  <Toggle checked={emailNotif} onChange={onEmailNotif} disabled={savingPref} />
                </div>
              </div>
            </Section>
          </div>

          {/* Security */}
          <div id="security">
            <Section title="Security" description="Keep your account secure">
              <div className="py-4 border-b border-gray-800">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-gray-800 rounded-lg">
                      <Key className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <p className="font-medium text-white">
                        {hasPassword ? "Change Password" : "Set a Password"}
                      </p>
                      <p className="text-sm text-gray-500">
                        {hasPassword
                          ? "Update your password regularly"
                          : "You sign in with Google. Add a password to sign in with your email too."}
                      </p>
                    </div>
                  </div>
                  {hasPassword ? (
                    <button
                      onClick={() => setShowPwForm((v) => !v)}
                      className="text-sm text-indigo-400 hover:text-indigo-300 shrink-0"
                    >
                      {showPwForm ? "Cancel" : "Change"}
                    </button>
                  ) : (
                    <button
                      onClick={sendPasswordSetup}
                      disabled={pwBusy}
                      className="text-sm text-indigo-400 hover:text-indigo-300 shrink-0 disabled:opacity-50"
                    >
                      {pwBusy ? "Sending…" : "Set password"}
                    </button>
                  )}
                </div>
                {hasPassword && showPwForm && (
                  <div className="mt-4 space-y-2 max-w-sm">
                    <input
                      type="password"
                      placeholder="Current password"
                      value={curPw}
                      onChange={(e) => setCurPw(e.target.value)}
                      className={inputCls}
                    />
                    <input
                      type="password"
                      placeholder="New password (min 8 chars)"
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      className={inputCls}
                    />
                    <input
                      type="password"
                      placeholder="Confirm new password"
                      value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)}
                      className={inputCls}
                    />
                    <button
                      onClick={changePassword}
                      disabled={pwBusy}
                      className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
                    >
                      {pwBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                      Update password
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 py-4">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-gray-800 rounded-lg">
                    <Shield className="w-5 h-5 text-gray-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white">Two-Factor Authentication</p>
                    <p className="text-sm text-gray-500">
                      {twoFA ? "Enabled — extra security is on" : "Add an extra layer of security"}
                    </p>
                  </div>
                </div>
                {twoFA ? (
                  <button
                    onClick={disable2FA}
                    className="text-sm text-red-400 hover:text-red-300 shrink-0"
                  >
                    Disable
                  </button>
                ) : (
                  <Link
                    href="/2fa-setup"
                    className="text-sm text-indigo-400 hover:text-indigo-300 shrink-0"
                  >
                    Enable
                  </Link>
                )}
              </div>
            </Section>
          </div>

          {/* Preferences */}
          <div id="preferences">
            <Section title="Preferences" description="Customize your experience">
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-gray-800 rounded-lg">
                      <Moon className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <p className="font-medium text-white">Theme</p>
                      <p className="text-sm text-gray-500">Choose your appearance & accent color</p>
                    </div>
                  </div>
                  {/* Mode segmented control */}
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: "dark", label: "Dark", Icon: Moon },
                        { id: "light", label: "Light", Icon: Sun },
                        { id: "system", label: "System", Icon: Monitor },
                      ] as const
                    ).map(({ id, label, Icon }) => (
                      <button
                        key={id}
                        onClick={() => applyTheme(id)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-medium transition-all",
                          theme === id
                            ? "border-indigo-500 bg-indigo-500/10 text-white"
                            : "border-gray-800 bg-gray-800/40 text-gray-400 hover:text-white hover:border-gray-700"
                        )}
                      >
                        <Icon className="w-5 h-5" />
                        {label}
                      </button>
                    ))}
                  </div>
                  {/* Accent swatches */}
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-2">
                      Accent Color
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {ACCENTS.map((id) => (
                        <button
                          key={id}
                          onClick={() => applyAccent(id)}
                          style={{ background: ACCENT_GRADIENT[id] ?? ACCENT_HEX[id] }}
                          className={cn(
                            "w-8 h-8 rounded-full ring-2 ring-offset-2 ring-offset-gray-900 transition-all capitalize",
                            accent === id ? "ring-white" : "ring-transparent hover:ring-white/40"
                          )}
                          title={id}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-gray-800 rounded-lg">
                      <Globe className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <p className="font-medium text-white">Language</p>
                      <p className="text-sm text-gray-500">Select your preferred language</p>
                    </div>
                  </div>
                  <select
                    value={language}
                    onChange={(e) => onLanguage(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="en">English</option>
                    <option value="bn">বাংলা</option>
                  </select>
                </div>
              </div>
            </Section>
          </div>

          {/* Danger Zone */}
          <Section title="Danger Zone">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <div>
                <p className="font-medium text-red-400">Delete Account</p>
                <p className="text-sm text-gray-500">
                  Permanently delete your account and all data
                </p>
              </div>
              <button
                onClick={() => setShowDelete(true)}
                className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </Section>
        </div>
      </div>

      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-white">Delete account?</h3>
            <p className="text-sm text-gray-400 mt-2">
              This blocks your login and removes your personal data. Type{" "}
              <span className="font-mono text-red-400">DELETE</span> to confirm.
            </p>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              className={inputCls + " mt-4"}
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  setShowDelete(false);
                  setDeleteConfirm("");
                }}
                className="flex-1 py-2 rounded-lg bg-gray-800 text-white text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={deleteAccount}
                disabled={deleteConfirm !== "DELETE" || deleteBusy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-bold disabled:opacity-50"
              >
                {deleteBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
