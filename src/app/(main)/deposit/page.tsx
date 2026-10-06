import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DepositView } from "@/components/user/wallet/deposit-view";
import { ServerAdSlot } from "@/components/user/primitives/server-ad-slot";

export default async function DepositPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { from } = await searchParams;
  return (
    <>
      <ServerAdSlot placement="DEPOSIT_TOP" className="mb-4" />
      <DepositView from={from} />
    </>
  );
}
