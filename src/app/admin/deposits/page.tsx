import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { AdminDepositsView } from "@/components/admin/deposits/admin-deposits-view";

export default async function AdminDepositsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "withdrawals.view"))) redirect("/admin");

  return <AdminDepositsView canProcess={await can(session.user.id, "withdrawals.process")} />;
}
