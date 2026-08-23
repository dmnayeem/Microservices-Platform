import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ReferralSettingsForm } from "../_components/ReferralSettingsForm";
import { ArrowLeft, Settings } from "lucide-react";
import Link from "next/link";

export default async function ReferralSettingsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!(await can(session.user.id, "referrals.configure"))) {
    redirect("/admin/referrals");
  }

  // Fetch existing referral levels
  const referralLevels = await prisma.referralLevel.findMany({
    orderBy: { level: "asc" },
  });

  // Ensure we have all 10 levels
  const levels = Array.from({ length: 10 }, (_, i) => {
    const level = i + 1;
    const existingLevel = referralLevels.find((l) => l.level === level);

    if (existingLevel) {
      return existingLevel;
    }

    // Create default level if it doesn't exist
    return {
      id: `temp-${level}`,
      level,
      commissionType: "PERCENTAGE" as const,
      commissionValue: 0,
      description: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/referrals"
          className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gray-800">
            <Settings className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Referral Commission Settings</h1>
            <p className="text-gray-400">Configure 10-level MLM commission rates</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <ReferralSettingsForm levels={levels} isNew={referralLevels.length < 10} />
    </div>
  );
}
