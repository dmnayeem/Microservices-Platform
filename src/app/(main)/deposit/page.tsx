import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DepositView } from "@/components/user/wallet/deposit-view";

export default async function DepositPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { from } = await searchParams;
  return <DepositView from={from} />;
}
