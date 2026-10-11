import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SpotlightView } from "@/components/user/spotlight/spotlight-view";

export const metadata = { title: "Spotlight" };

export default async function SpotlightPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <SpotlightView />;
}
