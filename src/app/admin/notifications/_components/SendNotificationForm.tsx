"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { NOTIFICATION_STYLES } from "@/lib/notification-styles";
import { NotificationCard } from "@/components/user/primitives/notification-card";
import {
  TaskAudienceTargeting,
  type TaskAudienceValue,
} from "@/components/admin/tasks/task-audience-targeting";

const EMPTY_AUDIENCE: TaskAudienceValue = {
  countries: [], genders: [], minAge: null, maxAge: null,
  regions: [], divisions: [], districts: [], subDistricts: [], postalCodes: [],
};
import {
  Send,
  X,
  AlertCircle,
  Loader2,
  Users,
  User,
  Search,
  Crown,
  CheckCircle,
  Bell,
  Megaphone,
  Wallet,
  Trophy,
  Ticket,
  MessageSquare,
  Filter,
  Calendar,
  Layers,
  ImageIcon,
  ExternalLink,
} from "lucide-react";
import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";
import { DateField } from "@/components/ui/date-field";

const NOTIFICATION_TYPES = [
  { value: "SYSTEM", label: "System", icon: AlertCircle, color: "text-gray-400" },
  { value: "TASK", label: "Task", icon: CheckCircle, color: "text-blue-400" },
  { value: "WALLET", label: "Wallet", icon: Wallet, color: "text-emerald-400" },
  { value: "REFERRAL", label: "Referral", icon: Users, color: "text-purple-400" },
  { value: "PROMOTION", label: "Promotion", icon: Megaphone, color: "text-amber-400" },
  { value: "ACHIEVEMENT", label: "Achievement", icon: Trophy, color: "text-yellow-400" },
  { value: "LOTTERY", label: "Lottery", icon: Ticket, color: "text-pink-400" },
  { value: "SOCIAL", label: "Social", icon: MessageSquare, color: "text-indigo-400" },
];

const TARGET_OPTIONS = [
  {
    value: "all",
    label: "All Users",
    description: "Every active user",
    icon: Users,
    iconColor: "text-blue-400",
  },
  {
    value: "package",
    label: "By Package",
    description: "One or more tiers",
    icon: Crown,
    iconColor: "text-purple-400",
  },
  {
    value: "segment",
    label: "Segment",
    description: "Multi-criteria filter",
    icon: Filter,
    iconColor: "text-pink-400",
  },
  {
    value: "specific",
    label: "Specific Users",
    description: "Select individuals",
    icon: User,
    iconColor: "text-emerald-400",
  },
] as const;

const PACKAGE_TIERS = ["FREE", "STARTER", "PRO", "ELITE", "VIP"] as const;
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

const TEMPLATES = [
  {
    name: "New Task Available",
    type: "TASK",
    title: "🎯 New high-paying task available!",
    message: "Don't miss out — earn extra points today.",
  },
  {
    name: "Withdrawal Approved",
    type: "WALLET",
    title: "✅ Withdrawal approved",
    message: "Your withdrawal has been approved and is on its way.",
  },
  {
    name: "Weekend Bonus",
    type: "PROMOTION",
    title: "🎉 2X Weekend Bonus!",
    message: "Earn double points on all tasks this weekend only.",
  },
  {
    name: "New Lottery",
    type: "LOTTERY",
    title: "🎰 New lottery draw started",
    message: "Buy your tickets now for a chance to win big.",
  },
  {
    name: "System Maintenance",
    type: "SYSTEM",
    title: "🛠 Scheduled maintenance",
    message: "We'll be performing maintenance shortly. Sorry for the inconvenience.",
  },
];

interface SearchedUser {
  id: string;
  name: string | null;
  email: string;
  avatar: string | null;
  packageTier: string;
}

/** Map the segment fields + audience picker into the AudienceCriteria payload. */
function buildCriteria(
  fd: { segPackages: string[]; minLevel: string; maxLevel: string; activeWithinDays: string },
  a: TaskAudienceValue
): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  if (a.countries.length) c.countries = a.countries;
  if (a.regions.length) c.regions = a.regions;
  if (a.divisions.length) c.divisions = a.divisions;
  if (a.districts.length) c.districts = a.districts;
  if (a.subDistricts.length) c.subDistricts = a.subDistricts;
  if (a.postalCodes.length) c.postalCodes = a.postalCodes;
  if (a.genders.length) c.genders = a.genders;
  if (a.minAge != null) c.minAge = a.minAge;
  if (a.maxAge != null) c.maxAge = a.maxAge;
  if (fd.segPackages.length) c.packages = fd.segPackages;
  if (fd.minLevel) c.minLevel = parseInt(fd.minLevel, 10);
  if (fd.maxLevel) c.maxLevel = parseInt(fd.maxLevel, 10);
  if (fd.activeWithinDays) c.activeWithinDays = parseInt(fd.activeWithinDays, 10);
  return c;
}

export function SendNotificationForm() {
  const router = useRouter();

  const [view, setView] = useState<"form" | "templates">("form");

  const [formData, setFormData] = useState({
    type: "SYSTEM",
    title: "",
    message: "",
    target: "all" as "all" | "package" | "segment" | "specific",
    packageFilter: [] as string[],
    userIds: [] as string[],

    // Segment criteria
    segPackages: [] as string[],
    minLevel: "",
    maxLevel: "",
    activeWithinDays: "",
    minTasksCompleted: "",

    // Optional content
    priority: "NORMAL" as (typeof PRIORITIES)[number],
    imageUrl: "",
    actionUrl: "",
    actionLabel: "",

    // Schedule
    scheduledFor: "",

    // Channels
    sendInApp: true,
    sendPush: false,
    sendEmail: false,
    emailSubject: "",
    emailBody: "",
    important: false,
    style: "PLAIN",
    kicker: "",
  });

  const [audience, setAudience] = useState<TaskAudienceValue>(EMPTY_AUDIENCE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // User search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchedUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<SearchedUser[]>([]);
  const [searching, setSearching] = useState(false);

  // Estimated reach
  const [estimate, setEstimate] = useState<number | null>(null);
  // Today's email allowance, so a send of 40,000 does not look like a failure
  // when 500 of them leave today and the rest go out tomorrow.
  const [budget, setBudget] = useState<{
    cap: number;
    usedToday: number;
    remainingToday: number | null;
  } | null>(null);

  useEffect(() => {
    fetch("/api/admin/notifications/send", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.emailBudget && setBudget(j.emailBudget))
      .catch(() => {});
  }, []);
  const [estimating, setEstimating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recompute estimate whenever target/criteria change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setEstimating(true);
      try {
        const payload: Record<string, unknown> = {
          target: formData.target,
        };
        if (formData.target === "package") {
          payload.packageFilter = formData.packageFilter;
        } else if (formData.target === "specific") {
          payload.userIds = selectedUsers.map((u) => u.id);
        } else if (formData.target === "segment") {
          payload.criteria = buildCriteria(formData, audience);
          if (formData.minTasksCompleted)
            payload.minTasksCompleted = parseInt(
              formData.minTasksCompleted,
              10
            );
        }

        const res = await fetch("/api/admin/notifications/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          setEstimate(data.count ?? 0);
        }
      } catch {
        setEstimate(null);
      } finally {
        setEstimating(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [
    formData.target,
    formData.packageFilter,
    formData.segPackages,
    formData.minLevel,
    formData.maxLevel,
    formData.activeWithinDays,
    formData.minTasksCompleted,
    audience,
    selectedUsers,
  ]);

  const searchUsers = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const response = await fetch(
        `/api/admin/users/search?q=${encodeURIComponent(query)}`
      );
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.users || []);
      }
    } catch {
      console.error("Search failed");
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    if (!formData.title.trim()) {
      setError("Title is required");
      setLoading(false);
      return;
    }
    if (formData.title.length > 50) {
      setError("Title must be 50 characters or less");
      setLoading(false);
      return;
    }
    if (!formData.message.trim()) {
      setError("Message is required");
      setLoading(false);
      return;
    }
    if (formData.message.length > 200) {
      setError("Message must be 200 characters or less");
      setLoading(false);
      return;
    }
    if (formData.target === "package" && formData.packageFilter.length === 0) {
      setError("Please select at least one package tier");
      setLoading(false);
      return;
    }
    if (formData.target === "specific" && selectedUsers.length === 0) {
      setError("Please select at least one user");
      setLoading(false);
      return;
    }

    try {
      const payload: Record<string, unknown> = {
        type: formData.type,
        title: formData.title,
        message: formData.message,
        target: formData.target,
        priority: formData.priority,
        sendInApp: formData.sendInApp,
        sendPush: formData.sendPush,
        sendEmail: formData.sendEmail,
        important: formData.important,
        style: formData.style,
        ...(formData.kicker.trim() ? { kicker: formData.kicker.trim() } : {}),
        ...(formData.sendEmail && formData.emailSubject.trim()
          ? { emailSubject: formData.emailSubject.trim() }
          : {}),
        ...(formData.sendEmail && formData.emailBody.trim()
          ? { emailBody: formData.emailBody.trim() }
          : {}),
      };
      if (formData.target === "package") {
        payload.packageFilter = formData.packageFilter;
      } else if (formData.target === "specific") {
        payload.userIds = selectedUsers.map((u) => u.id);
      } else if (formData.target === "segment") {
        payload.criteria = buildCriteria(formData, audience);
        if (formData.minTasksCompleted)
          payload.minTasksCompleted = parseInt(formData.minTasksCompleted);
      }
      if (formData.imageUrl) payload.imageUrl = formData.imageUrl;
      if (formData.actionUrl) payload.actionUrl = formData.actionUrl;
      if (formData.actionLabel) payload.actionLabel = formData.actionLabel;
      if (formData.scheduledFor)
        payload.scheduledFor = new Date(formData.scheduledFor).toISOString();

      const response = await fetch("/api/admin/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to send notification");
      }

      setSuccess(
        data.scheduled
          ? `Scheduled for ${new Date(data.scheduledFor).toLocaleString()} — ${data.recipientCount} recipient(s). It is sent even if nobody is on the site.`
          : data.finished
            ? `Sent to ${data.recipientCount} user(s).`
            : `Started — ${data.recipientCount} recipient(s). Delivery continues in the background; watch it on Broadcasts.` +
              (data.note ? ` ${data.note}` : "")
      );
      setTimeout(
        () => {
          router.push(
            data.scheduled || !data.finished
              ? "/admin/notifications/broadcasts"
              : "/admin/notifications"
          );
          router.refresh();
        },
        2000
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const togglePackage = (pkg: string) => {
    setFormData((prev) => ({
      ...prev,
      packageFilter: prev.packageFilter.includes(pkg)
        ? prev.packageFilter.filter((p) => p !== pkg)
        : [...prev.packageFilter, pkg],
    }));
  };

  const toggleSegPackage = (pkg: string) => {
    setFormData((prev) => ({
      ...prev,
      segPackages: prev.segPackages.includes(pkg)
        ? prev.segPackages.filter((p) => p !== pkg)
        : [...prev.segPackages, pkg],
    }));
  };

  const addUser = (user: SearchedUser) => {
    if (!selectedUsers.find((u) => u.id === user.id)) {
      setSelectedUsers([...selectedUsers, user]);
    }
    setSearchQuery("");
    setSearchResults([]);
  };

  const removeUser = (userId: string) => {
    setSelectedUsers(selectedUsers.filter((u) => u.id !== userId));
  };

  const applyTemplate = (t: (typeof TEMPLATES)[number]) => {
    setFormData((prev) => ({
      ...prev,
      type: t.type,
      title: t.title,
      message: t.message,
    }));
    setView("form");
  };

  return (
    <div className="space-y-6">
      {/* Top tab switch */}
      <div className="flex gap-1 border-b border-slate-800">
        <button
          type="button"
          onClick={() => setView("form")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
            view === "form"
              ? "border-blue-500 text-white"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          Compose
        </button>
        <button
          type="button"
          onClick={() => setView("templates")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-2 ${
            view === "templates"
              ? "border-blue-500 text-white"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <Layers className="w-4 h-4" />
          Templates
        </button>
      </div>

      {view === "templates" && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Pre-built Templates
          </h2>
          <p className="text-sm text-slate-400 mb-4">
            Click any template to load it into the composer.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {TEMPLATES.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => applyTemplate(t)}
                className="text-left p-4 rounded-lg border border-slate-700 bg-slate-950/50 hover:border-blue-500 transition-colors"
              >
                <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">
                  {t.name}
                </p>
                <p className="text-white font-medium">{t.title}</p>
                <p className="text-sm text-slate-400 mt-1 line-clamp-2">
                  {t.message}
                </p>
                <span className="inline-block mt-3 px-2 py-0.5 rounded-full bg-slate-800 text-xs text-slate-400">
                  {t.type}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {view === "form" && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <p className="text-red-400">{error}</p>
            </div>
          )}

          {success && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              <p className="text-emerald-400">{success}</p>
            </div>
          )}

          {/* Type + Priority */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              Notification Type
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {NOTIFICATION_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, type: type.value })}
                    className={`p-4 rounded-lg border text-left transition-colors ${
                      formData.type === type.value
                        ? "bg-blue-500/10 border-blue-500"
                        : "bg-slate-950/50 border-slate-700 hover:border-slate-600"
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${type.color} mb-2`} />
                    <p className="text-sm font-medium text-white">{type.label}</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Priority
              </label>
              <select
                value={formData.priority}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    priority: e.target.value as (typeof PRIORITIES)[number],
                  })
                }
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Content */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Content</h2>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-400">
                  Title <span className="text-red-400">*</span>
                </label>
                <span className="text-xs text-slate-500 tabular-nums">
                  {formData.title.length}/50
                </span>
              </div>
              <input
                type="text"
                maxLength={80}
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="Enter notification title…"
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-400">
                  Message <span className="text-red-400">*</span>
                </label>
                <span className="text-xs text-slate-500 tabular-nums">
                  {formData.message.length}/200
                </span>
              </div>
              <textarea
                maxLength={500}
                value={formData.message}
                onChange={(e) =>
                  setFormData({ ...formData, message: e.target.value })
                }
                placeholder="Enter notification message…"
                rows={3}
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            {/* Template. Kept separate from "Type" above: type decides which
                filter tab the user finds this under and must keep meaning
                "wallet" forever; the template decides how loudly it is said. */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Template
              </label>
              <div className="flex flex-wrap gap-1.5">
                {NOTIFICATION_STYLES.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, style: st.id })}
                    title={st.hint}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition",
                      formData.style === st.id
                        ? "border-white/60 text-white"
                        : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-white"
                    )}
                    style={
                      formData.style === st.id
                        ? { backgroundColor: st.mail.accent }
                        : undefined
                    }
                  >
                    {st.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                {NOTIFICATION_STYLES.find((x) => x.id === formData.style)?.hint}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Kicker <span className="text-slate-600">(optional)</span>
              </label>
              <input
                type="text"
                maxLength={60}
                value={formData.kicker}
                onChange={(e) => setFormData({ ...formData, kicker: e.target.value })}
                placeholder="e.g. Ends in 3 hours"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* The real component the user will see, not a mock-up of it. A
                separate preview drifts from the thing it previews, and the one
                time that matters is the send that already went out. */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Preview
              </label>
              <div className="rounded-xl border border-slate-800 bg-[#0b0b12] p-3">
                <NotificationCard
                  title={formData.title || "Your title appears here"}
                  message={formData.message || "And the message, exactly as the user reads it."}
                  createdAtLabel="just now"
                  data={{
                    style: formData.style,
                    ...(formData.kicker ? { kicker: formData.kicker } : {}),
                    ...(formData.imageUrl ? { imageUrl: formData.imageUrl } : {}),
                    ...(formData.actionUrl ? { actionUrl: formData.actionUrl } : {}),
                    ...(formData.actionLabel ? { actionLabel: formData.actionLabel } : {}),
                  }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                The animation is in-app only. Gmail strips CSS animation, so the
                email uses the same colour as a band, badge and button instead.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  <ImageIcon className="w-3.5 h-3.5 inline mr-1" /> Image
                </label>
                <ImageUploadField
                  value={formData.imageUrl}
                  onChange={(url) =>
                    setFormData({ ...formData, imageUrl: url })
                  }
                  title="Select Notification Image"
                  previewSize="sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  <ExternalLink className="w-3.5 h-3.5 inline mr-1" /> Action URL
                </label>
                <input
                  type="url"
                  value={formData.actionUrl}
                  onChange={(e) =>
                    setFormData({ ...formData, actionUrl: e.target.value })
                  }
                  placeholder="https://earngpt.com/…"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Action Button Label
                </label>
                <input
                  type="text"
                  maxLength={32}
                  value={formData.actionLabel}
                  onChange={(e) =>
                    setFormData({ ...formData, actionLabel: e.target.value })
                  }
                  placeholder="e.g. View Tasks"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Audience */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Audience</h2>
              <div className="text-sm">
                <span className="text-slate-400">Estimated reach: </span>
                {estimating ? (
                  <span className="inline-flex items-center gap-1 text-slate-400">
                    <Loader2 className="w-3 h-3 animate-spin" /> calculating
                  </span>
                ) : (
                  <span className="text-blue-400 font-bold tabular-nums">
                    {(estimate ?? 0).toLocaleString()}
                  </span>
                )}
              </div>
            </div>

            <div className="grid md:grid-cols-4 gap-3">
              {TARGET_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, target: option.value })
                    }
                    className={`p-4 rounded-lg border text-left transition-colors ${
                      formData.target === option.value
                        ? "bg-blue-500/10 border-blue-500"
                        : "bg-slate-950/50 border-slate-700 hover:border-slate-600"
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${option.iconColor} mb-2`} />
                    <p className="font-medium text-white text-sm">
                      {option.label}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>

            {formData.target === "package" && (
              <div className="p-4 bg-slate-950/50 rounded-lg">
                <p className="text-sm font-medium text-slate-400 mb-3">
                  Select Package Tiers
                </p>
                <div className="flex flex-wrap gap-2">
                  {PACKAGE_TIERS.map((pkg) => (
                    <button
                      key={pkg}
                      type="button"
                      onClick={() => togglePackage(pkg)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        formData.packageFilter.includes(pkg)
                          ? "bg-blue-600 text-white"
                          : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                      }`}
                    >
                      {pkg}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {formData.target === "segment" && (
              <div className="p-4 bg-slate-950/50 rounded-lg space-y-4">
                <div>
                  <p className="text-sm font-medium text-slate-400 mb-2">
                    Packages (any of)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {PACKAGE_TIERS.map((pkg) => (
                      <button
                        key={pkg}
                        type="button"
                        onClick={() => toggleSegPackage(pkg)}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                          formData.segPackages.includes(pkg)
                            ? "bg-blue-600 text-white"
                            : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                        }`}
                      >
                        {pkg}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      Min Level
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={formData.minLevel}
                      onChange={(e) =>
                        setFormData({ ...formData, minLevel: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      Max Level
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={formData.maxLevel}
                      onChange={(e) =>
                        setFormData({ ...formData, maxLevel: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      Active in last (days)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={formData.activeWithinDays}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          activeWithinDays: e.target.value,
                        })
                      }
                      placeholder="e.g. 7"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      Min tasks completed
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={formData.minTasksCompleted}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          minTasksCompleted: e.target.value,
                        })
                      }
                      placeholder="e.g. 5"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Demographic / location targeting — reuses the task audience
                    builder so pushes go out data-wise (country → upazila, gender, age). */}
                <div className="border-t border-slate-800 pt-4">
                  <p className="text-sm font-semibold text-white mb-1">
                    Demographic &amp; location
                  </p>
                  <p className="text-[11px] text-slate-500 mb-3">
                    Target by country / division / district / upazila, gender and
                    age. Leave empty for no demographic filter.
                  </p>
                  <TaskAudienceTargeting value={audience} onChange={(patch) => setAudience((a) => ({ ...a, ...patch }))} />
                </div>
              </div>
            )}

            {formData.target === "specific" && (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      searchUsers(e.target.value);
                    }}
                    placeholder="Search users by name or email…"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  {searching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 animate-spin" />
                  )}
                </div>

                {searchResults.length > 0 && (
                  <div className="bg-slate-950 border border-slate-700 rounded-lg divide-y divide-slate-800 max-h-48 overflow-y-auto">
                    {searchResults.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => addUser(user)}
                        disabled={selectedUsers.some((u) => u.id === user.id)}
                        className="w-full p-3 text-left hover:bg-slate-800/50 transition-colors flex items-center gap-3 disabled:opacity-50"
                      >
                        <div className="w-8 h-8 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-medium">
                          {user.name?.charAt(0) || user.email.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {user.name || "Unnamed"}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {user.email}
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-400">
                          {user.packageTier}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {selectedUsers.length > 0 && (
                  <div className="p-3 bg-slate-950/50 rounded-lg">
                    <p className="text-sm font-medium text-slate-400 mb-2">
                      Selected ({selectedUsers.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedUsers.map((user) => (
                        <div
                          key={user.id}
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg"
                        >
                          <span className="text-sm text-white">
                            {user.name || user.email}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeUser(user.id)}
                            className="text-slate-400 hover:text-red-400 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Channels & Schedule */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Channels</h2>
              <div className="space-y-2">
                <label className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.sendInApp}
                    onChange={(e) =>
                      setFormData({ ...formData, sendInApp: e.target.checked })
                    }
                    className="rounded bg-slate-800 border-slate-600 text-blue-500"
                  />
                  <Bell className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-white">In-App Notification</span>
                </label>
                <label className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.sendPush}
                    onChange={(e) =>
                      setFormData({ ...formData, sendPush: e.target.checked })
                    }
                    className="rounded bg-slate-800 border-slate-600 text-blue-500"
                  />
                  <Send className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-white">Push Notification</span>
                  <span className="ml-auto text-xs text-slate-500">
                    via OneSignal
                  </span>
                </label>
                <label className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.sendEmail}
                    onChange={(e) =>
                      setFormData({ ...formData, sendEmail: e.target.checked })
                    }
                    className="rounded bg-slate-800 border-slate-600 text-blue-500"
                  />
                  <MessageSquare className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-white">Email</span>
                  <span className="ml-auto text-xs text-slate-500">paced daily</span>
                </label>

                <label className="flex items-start gap-3 px-3 py-2 rounded-lg border border-rose-500/30 bg-rose-500/5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.important}
                    onChange={(e) =>
                      setFormData({ ...formData, important: e.target.checked })
                    }
                    className="mt-0.5 rounded bg-slate-800 border-slate-600 text-rose-500"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-white">
                      Important — service notice, not marketing
                    </span>
                    {/* Registering is consent to hear about the account. It is
                        not consent to be marketed at, and the two must not share
                        a switch: dropping "your withdrawal failed" because
                        somebody turned off offers is how a user loses money
                        without ever being told. */}
                    <span className="block text-[11px] text-slate-400 mt-0.5">
                      Security, payments, outages, changes to the terms. Reaches users
                      who switched marketing email off, ignores the daily cap, and goes
                      ahead of anything promotional. Do not use it for offers — that is
                      what gets a sending domain blocked.
                    </span>
                  </span>
                </label>

                {formData.sendEmail && (
                  <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                    {/* An email is not a notification row. Reusing the 80/500
                        limits above makes a mail with nothing to say, which is
                        exactly what the email channel used to send. */}
                    <p className="text-[11px] text-slate-500">
                      Optional — leave blank to email the title and message above.
                    </p>
                    <input
                      value={formData.emailSubject}
                      onChange={(e) =>
                        setFormData({ ...formData, emailSubject: e.target.value })
                      }
                      maxLength={150}
                      placeholder="Email subject"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                    />
                    <textarea
                      value={formData.emailBody}
                      onChange={(e) =>
                        setFormData({ ...formData, emailBody: e.target.value })
                      }
                      rows={5}
                      maxLength={5000}
                      placeholder="Email body — say as much as you need here."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                    />
                    {budget && (
                      <p className="text-[11px] text-slate-400">
                        {budget.cap === 0
                          ? `No daily cap set · ${budget.usedToday.toLocaleString()} sent today`
                          : `${(budget.remainingToday ?? 0).toLocaleString()} of ${budget.cap.toLocaleString()} emails left today`}
                        {formData.important
                          ? " — an important notice is not held back by this cap."
                          : estimate !== null &&
                              budget.cap > 0 &&
                              estimate > (budget.remainingToday ?? 0)
                            ? " — the rest goes out tomorrow, automatically."
                            : ""}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-400" />
                Delivery
              </h2>
              <div className="space-y-3">
                <label className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/50 cursor-pointer">
                  <input
                    type="radio"
                    name="schedule"
                    checked={!formData.scheduledFor}
                    onChange={() => setFormData({ ...formData, scheduledFor: "" })}
                  />
                  <span className="text-sm text-white">Send immediately</span>
                </label>
                <div>
                  <label className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/50 cursor-pointer mb-2">
                    <input
                      type="radio"
                      name="schedule"
                      checked={!!formData.scheduledFor}
                      onChange={() => {
                        // default 1 hour from now
                        const dt = new Date();
                        dt.setHours(dt.getHours() + 1);
                        setFormData({
                          ...formData,
                          scheduledFor: dt.toISOString().slice(0, 16),
                        });
                      }}
                    />
                    <span className="text-sm text-white">Schedule for later</span>
                  </label>
                  <DateField
                    type="datetime-local"
                    disabled={!formData.scheduledFor}
                    value={formData.scheduledFor}
                    onChange={(v) =>
                      setFormData({ ...formData, scheduledFor: v })
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Preview */}
          {formData.title && formData.message && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Preview</h2>
              <div className="p-4 bg-slate-950/50 rounded-lg flex items-start gap-3">
                <div className="p-2 bg-slate-800 rounded-lg">
                  <Bell className="w-5 h-5 text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-white">{formData.title}</p>
                  <p className="text-sm text-slate-400 mt-1">{formData.message}</p>
                  {formData.actionLabel && formData.actionUrl && (
                    <button
                      type="button"
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded bg-blue-600/20 text-blue-400 text-xs"
                    >
                      {formData.actionLabel} →
                    </button>
                  )}
                  <p className="text-xs text-slate-600 mt-2">Just now</p>
                </div>
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => router.push("/admin/notifications")}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading || !formData.title || !formData.message}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
              {formData.scheduledFor ? "Schedule" : "Send Now"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
