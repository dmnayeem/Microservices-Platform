import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSeoSettings } from "@/lib/seo-settings";
import { getNetworkGlobals } from "@/lib/ad-network";
import { SeoSettingsForm } from "@/components/admin/seo/seo-settings-form";

export const dynamic = "force-dynamic";

export default async function AdminSeoPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "settings.view"))) redirect("/admin");

  const [values, canEdit, network] = await Promise.all([
    getSeoSettings(),
    can(session.user.id, "settings.edit"),
    getNetworkGlobals(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">SEO &amp; Tracking</h1>
        <p className="mt-1 text-sm text-slate-400">
          Site name, logo, favicon, how the site looks in Google and when shared, search-engine verification, the
          Google Knowledge Panel, analytics &amp; pixels, and custom code — all in one place.
        </p>
      </div>
      <SeoSettingsForm
        initial={values}
        canEdit={canEdit}
        isSuper={session.user.role === "SUPER_ADMIN"}
        adsenseClient={network.adsenseClient}
        siteUrl={process.env.NEXT_PUBLIC_APP_URL || "https://earngpt.app"}
      />
    </div>
  );
}
