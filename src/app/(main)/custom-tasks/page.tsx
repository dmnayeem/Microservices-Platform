import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CustomTasksView } from "@/components/user/tasks/custom-tasks-view";

export default async function CustomTasksPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <CustomTasksView />;
}
