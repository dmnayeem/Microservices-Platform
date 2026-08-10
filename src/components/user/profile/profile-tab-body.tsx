"use client";

import Link from "next/link";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Shield,
  Globe,
  CheckCircle2,
  Circle,
  Edit3,
  Sparkles,
  Twitter,
  Lock,
  Palette,
  ChevronRight,
  Plus,
  Briefcase,
  Languages,
  Coins,
  Droplet,
  GraduationCap,
  ShoppingBag,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BecomeTutorCard } from "@/components/user/profile/become-tutor-card";
import type { ProfileResponse, EditTab, SocialAccount } from "./profile-view.types";
import { COUNTRIES, LANGUAGES, PLATFORM_META } from "./profile-view.constants";
import { Card, InfoRow, DataLine, VerifTile, CompletionRing } from "./profile-ui";
import {
  PersonalTab,
  AddressTab,
  KycTab,
  SocialTab,
  PrivacyTab,
  ThemeTab,
  SecurityTab,
} from "./profile-edit-tabs";

export function ProfileTabBody({
  data,
  patch,
  editAnchorRef,
  editOpen,
  setEditOpen,
  editTab,
  setEditTab,
  openEdit,
  onJumpCompletion,
  onConnectSocial,
  onDisconnectSocial,
}: {
  data: ProfileResponse;
  patch: (body: Record<string, unknown>) => Promise<boolean>;
  editAnchorRef: React.RefObject<HTMLDivElement | null>;
  editOpen: boolean;
  setEditOpen: (v: boolean) => void;
  editTab: EditTab;
  setEditTab: (t: EditTab) => void;
  openEdit: (which?: EditTab) => void;
  onJumpCompletion: (href?: string) => void;
  onConnectSocial: (p: SocialAccount["platform"]) => void;
  onDisconnectSocial: (id: string) => void;
}) {
  const { profile, address, stats, verification, preferences, socialAccounts, completion } = data;

  return (
    <div className="space-y-5">
      {/* Two-column on desktop, single column on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left rail (1/3) — about, contact, work */}
        <div className="space-y-5 lg:col-span-1">
          <Card
            title="Intro"
            icon={<Sparkles className="w-3.5 h-3.5" />}
            tone="indigo"
          >
            <p className="text-sm text-gray-300 whitespace-pre-wrap">
              {profile.bio || (
                <span className="text-gray-500 italic">
                  No bio yet. Click Edit Profile to add one.
                </span>
              )}
            </p>
            <div className="space-y-2 mt-3 pt-3 border-t border-gray-800">
              <InfoRow icon={<Mail className="w-3.5 h-3.5" />} label={profile.email} sub="Email" />
              {profile.phone && (
                <InfoRow icon={<Phone className="w-3.5 h-3.5" />} label={profile.phone} sub="Phone" />
              )}
              {profile.profession && (
                <InfoRow icon={<Briefcase className="w-3.5 h-3.5" />} label={profile.profession} sub="Works as" />
              )}
              {profile.country && (
                <InfoRow
                  icon={<MapPin className="w-3.5 h-3.5" />}
                  label={COUNTRIES.find((c) => c.code === profile.country)?.name ?? profile.country}
                  sub="From"
                />
              )}
              {profile.language && (
                <InfoRow
                  icon={<Languages className="w-3.5 h-3.5" />}
                  label={LANGUAGES.find((l) => l.code === profile.language)?.name ?? profile.language}
                  sub="Speaks"
                />
              )}
              <InfoRow
                icon={<Calendar className="w-3.5 h-3.5" />}
                label={new Date(profile.createdAt).toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
                sub="Joined"
              />
            </div>
            <button
              onClick={() => openEdit("personal")}
              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Details
            </button>
          </Card>

          <Card
            title="Profile Completion"
            icon={<CheckCircle2 className="w-3.5 h-3.5" />}
            tone="emerald"
          >
            <div className="flex items-center gap-3">
              <CompletionRing percentage={completion.percentage} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400">
                  {completion.percentage === 100
                    ? "All set!"
                    : `${completion.missing.length} item${completion.missing.length === 1 ? "" : "s"} left`}
                </p>
                <p className="text-[11px] text-indigo-400 mt-0.5">
                  Higher % = better task acceptance
                </p>
              </div>
            </div>
            {completion.missing.length > 0 && (
              <div className="mt-3 space-y-1.5 max-h-44 overflow-y-auto">
                {completion.missing.slice(0, 8).map((it) => (
                  <button
                    key={it.key}
                    onClick={() => onJumpCompletion(it.href)}
                    className="w-full flex items-center gap-2 p-2 rounded-lg bg-gray-950 border border-gray-800 hover:border-indigo-500/40 text-left transition-colors"
                  >
                    <Circle className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                    <span className="text-xs text-gray-300 flex-1 truncate">{it.label}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right rail (2/3) — about, address, verification, socials, lifetime */}
        <div className="space-y-5 lg:col-span-2">
          <Card
            title="Personal Info"
            icon={<User className="w-3.5 h-3.5" />}
            tone="purple"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
              <DataLine label="First name" value={profile.firstName} />
              <DataLine label="Last name" value={profile.lastName} />
              <DataLine label="Username" value={profile.username && `@${profile.username}`} />
              <DataLine
                label="Date of birth"
                value={
                  profile.dateOfBirth
                    ? new Date(profile.dateOfBirth).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })
                    : null
                }
              />
              <DataLine label="Gender" value={profile.gender} />
              <DataLine
                label="Blood group"
                value={profile.bloodGroup}
                icon={<Droplet className="w-3.5 h-3.5 text-rose-400" />}
              />
              <DataLine label="Nationality" value={profile.nationality} />
              <DataLine
                label="Profession"
                value={profile.profession}
                icon={<Briefcase className="w-3.5 h-3.5 text-amber-400" />}
              />
              <DataLine label="Secondary email" value={profile.secondaryEmail} />
              <DataLine label="Secondary phone" value={profile.secondaryPhone} />
            </div>
            <div className="flex justify-end pt-3 mt-3 border-t border-gray-800">
              <button
                onClick={() => openEdit("personal")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit Personal Info
              </button>
            </div>
          </Card>

          <Card
            title="Address"
            icon={<MapPin className="w-3.5 h-3.5" />}
            tone="rose"
          >
            {address.street ||
            address.village ||
            address.city ||
            address.district ||
            address.country ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
                <DataLine label="Street / House" value={address.street} />
                <DataLine label="Village / Neighborhood" value={address.village} />
                <DataLine label="City" value={address.city} />
                <DataLine label="Sub-district" value={address.subDistrict} />
                <DataLine label="District" value={address.district} />
                <DataLine label="Division / State" value={address.division} />
                <DataLine label="Region" value={address.region} />
                <DataLine label="Postal Code" value={address.postalCode} />
                <DataLine label="Country" value={address.country} />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-700 bg-gray-950 p-4 text-center">
                <MapPin className="w-6 h-6 text-gray-600 mx-auto mb-1" />
                <p className="text-sm text-gray-400 font-semibold">
                  No address set yet
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Add one to boost your profile completion.
                </p>
              </div>
            )}
            <div className="flex justify-end pt-3 mt-3 border-t border-gray-800">
              <button
                onClick={() => openEdit("address")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit Address
              </button>
            </div>
          </Card>

          <Card
            title="Verification & Security"
            icon={<Shield className="w-3.5 h-3.5" />}
            tone="sky"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <VerifTile
                icon={<Mail className="w-4 h-4" />}
                label="Email"
                ok={verification.isEmailVerified}
                action={
                  verification.isEmailVerified
                    ? null
                    : { label: "Verify", href: "/verify-email" }
                }
              />
              <VerifTile
                icon={<Phone className="w-4 h-4" />}
                label="Phone"
                ok={verification.isPhoneVerified}
                action={
                  verification.isPhoneVerified
                    ? null
                    : { label: "Verify", href: "/verify-phone" }
                }
              />
              <VerifTile
                icon={<Shield className="w-4 h-4" />}
                label="KYC"
                ok={verification.kycStatus === "APPROVED"}
                pending={verification.kycStatus === "PENDING"}
                rejected={verification.kycStatus === "REJECTED"}
                action={
                  verification.kycStatus === "APPROVED"
                    ? null
                    : verification.kycStatus === "REJECTED"
                    ? { label: "Appeal", href: "/kyc/appeal" }
                    : { label: "Submit", href: "/kyc" }
                }
              />
              <VerifTile
                icon={<Lock className="w-4 h-4" />}
                label="2FA"
                ok={verification.twoFactorEnabled}
                action={
                  verification.twoFactorEnabled
                    ? null
                    : { label: "Enable", href: "/2fa-setup" }
                }
              />
            </div>
          </Card>

          <Card
            title="Courses & Marketplace"
            icon={<GraduationCap className="w-3.5 h-3.5" />}
            tone="emerald"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Courses */}
              <div className="rounded-xl border border-gray-800 bg-gray-950 p-3">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                    <GraduationCap className="w-4 h-4" />
                  </div>
                  <p className="text-sm font-bold text-white">Courses</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/courses?filter=enrolled"
                    className="rounded-lg border border-gray-800 bg-gray-900 p-2 hover:border-emerald-500/40 transition-colors"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                      Enrolled
                    </p>
                    <p className="text-lg font-extrabold text-white tabular-nums">
                      {stats.coursesEnrolled.toLocaleString()}
                    </p>
                  </Link>
                  <Link
                    href="/courses?filter=created"
                    className="rounded-lg border border-gray-800 bg-gray-900 p-2 hover:border-emerald-500/40 transition-colors"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                      Created
                    </p>
                    <p className="text-lg font-extrabold text-white tabular-nums">
                      {stats.coursesCreated.toLocaleString()}
                    </p>
                  </Link>
                </div>
                <Link
                  href="/courses"
                  className="mt-2 inline-flex items-center gap-1 text-[11px] text-emerald-300 hover:text-emerald-200 font-semibold"
                >
                  Browse courses
                  <ChevronRight className="w-3 h-3" />
                </Link>
              </div>

              {/* Marketplace */}
              <div className="rounded-xl border border-gray-800 bg-gray-950 p-3">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <p className="text-sm font-bold text-white">Marketplace</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Link
                    href="/marketplace?tab=listings"
                    className="rounded-lg border border-gray-800 bg-gray-900 p-2 hover:border-amber-500/40 transition-colors"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                      Listings
                    </p>
                    <p className="text-lg font-extrabold text-white tabular-nums">
                      {stats.marketplaceListings.toLocaleString()}
                    </p>
                  </Link>
                  <Link
                    href="/marketplace?tab=sales"
                    className="rounded-lg border border-gray-800 bg-gray-900 p-2 hover:border-amber-500/40 transition-colors"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                      Sales
                    </p>
                    <p className="text-lg font-extrabold text-white tabular-nums">
                      {stats.marketplaceSales.toLocaleString()}
                    </p>
                  </Link>
                  <Link
                    href="/marketplace?tab=purchases"
                    className="rounded-lg border border-gray-800 bg-gray-900 p-2 hover:border-amber-500/40 transition-colors"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                      Bought
                    </p>
                    <p className="text-lg font-extrabold text-white tabular-nums">
                      {stats.marketplacePurchases.toLocaleString()}
                    </p>
                  </Link>
                </div>
                {stats.marketplaceSalesAmount > 0 && (
                  <p className="text-[11px] text-amber-300 mt-2 inline-flex items-center gap-1">
                    <Coins className="w-3 h-3" />
                    Earned{" "}
                    <span className="font-bold tabular-nums">
                      ${stats.marketplaceSalesAmount.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </span>{" "}
                    from sales
                  </p>
                )}
                <Link
                  href="/marketplace"
                  className="mt-2 inline-flex items-center gap-1 text-[11px] text-amber-300 hover:text-amber-200 font-semibold"
                >
                  Open marketplace
                  <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </Card>

          <BecomeTutorCard />

          {/* Sell & earn — apply for marketplace / advertiser / agency / affiliate access */}
          <Link
            href="/profile/become-creator"
            className="block rounded-2xl border border-fuchsia-500/30 bg-linear-to-br from-fuchsia-500/10 via-indigo-500/5 to-transparent p-4 hover:border-fuchsia-500/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-fuchsia-500/20 text-fuchsia-300 flex items-center justify-center shrink-0">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">Sell &amp; earn as a creator</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Apply to sell on the marketplace, run ads, become an affiliate, or start a
                    promotion agency. Admin reviews each request.
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-bold whitespace-nowrap">
                Explore <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </Link>

          <Card
            title="Connected Social Accounts"
            icon={<Globe className="w-3.5 h-3.5" />}
            tone="amber"
          >
            {socialAccounts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-700 bg-gray-950 p-4 text-center">
                <Globe className="w-6 h-6 text-gray-600 mx-auto mb-1" />
                <p className="text-sm text-gray-400 font-semibold">
                  No social accounts connected
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Connect them to show your reach.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {socialAccounts.map((acc) => {
                  const meta = PLATFORM_META[acc.platform];
                  return (
                    <div
                      key={acc.id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-gray-950 border border-gray-800"
                    >
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 bg-linear-to-br",
                          meta.gradient
                        )}
                      >
                        <meta.icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">
                          @{acc.username}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          {acc.followers.toLocaleString()} {meta.countLabel.toLowerCase()}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end pt-3 mt-3 border-t border-gray-800">
              <button
                onClick={() => openEdit("social")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold"
              >
                <Plus className="w-3.5 h-3.5" />
                Manage Social Accounts
              </button>
            </div>
          </Card>
        </div>
      </div>

      {/* Edit drawer (in-page accordion) */}
      <div ref={editAnchorRef} className="scroll-mt-20">
        <button
          onClick={() => setEditOpen(!editOpen)}
          className="w-full flex items-center justify-between gap-3 p-4 glass glass-hover"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center">
              <Edit3 className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-white">Edit Profile & Settings</p>
              <p className="text-[11px] text-gray-500">
                Personal info, address, KYC, privacy, theme, security
              </p>
            </div>
          </div>
          <ChevronRight
            className={cn(
              "w-5 h-5 text-gray-500 transition-transform",
              editOpen && "rotate-90"
            )}
          />
        </button>

        {editOpen && (
          <div className="mt-3 space-y-3">
            <nav className="flex gap-1 overflow-x-auto -mx-2 px-2 pb-1 border-b border-gray-800 scrollbar-thin">
              {(
                [
                  { key: "personal", label: "Personal", icon: User },
                  { key: "address", label: "Address", icon: MapPin },
                  { key: "kyc", label: "KYC", icon: Shield },
                  { key: "social", label: "Social", icon: Twitter },
                  { key: "privacy", label: "Privacy", icon: Lock },
                  { key: "theme", label: "Theme", icon: Palette },
                  { key: "security", label: "Security", icon: Shield },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setEditTab(t.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                    editTab === t.key
                      ? "bg-indigo-500/15 text-white border border-indigo-500/40"
                      : "text-gray-400 hover:text-white hover:bg-gray-900"
                  )}
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </button>
              ))}
            </nav>

            {editTab === "personal" && <PersonalTab data={data} patch={patch} />}
            {editTab === "address" && <AddressTab data={data} patch={patch} />}
            {editTab === "kyc" && <KycTab data={data} />}
            {editTab === "social" && (
              <SocialTab
                accounts={socialAccounts}
                onConnect={onConnectSocial}
                onDisconnect={onDisconnectSocial}
              />
            )}
            {editTab === "privacy" && (
              <PrivacyTab privacy={preferences.privacy} patch={patch} />
            )}
            {editTab === "theme" && <ThemeTab preferences={preferences} patch={patch} />}
            {editTab === "security" && <SecurityTab verification={verification} />}
          </div>
        )}
      </div>
    </div>
  );
}
