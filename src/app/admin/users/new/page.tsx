import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { type UserRole } from "@/lib/rbac";
import { CreateUserForm } from "@/components/admin/users/create-user-form";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function NewUserPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const adminRole = session.user.role as UserRole | undefined;
  if (!(await can(session.user.id, "users.edit"))) redirect("/admin/users");

  const isSuperAdmin = adminRole === "SUPER_ADMIN";

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/users"
          className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Add New User</h1>
          <p className="text-gray-400 text-sm">
            Create a user account with full profile details. All sections except
            Account are optional and editable later.
          </p>
        </div>
      </div>

      <CreateUserForm isSuperAdmin={isSuperAdmin} />
    </div>
  );
}
