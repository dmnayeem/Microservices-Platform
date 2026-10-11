import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AmbassadorView } from "@/components/user/ambassador/ambassador-view";

export const metadata = { title: "Ambassador Program" };

export default async function AmbassadorPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <AmbassadorView />;
}
