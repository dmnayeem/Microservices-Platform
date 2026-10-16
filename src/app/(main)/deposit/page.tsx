import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DepositView } from "@/components/user/wallet/deposit-view";
import { ServerAdSlot } from "@/components/user/primitives/server-ad-slot";

export default async function DepositPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; amount?: string; returnTo?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // `amount` / `returnTo` come from an "Add fund" link on a payment screen
  // (src/lib/pay-source.ts addFundHref) — DepositView validates both.
  const { from, amount, returnTo } = await searchParams;
  return (
    <>
      <ServerAdSlot placement="DEPOSIT_TOP" className="mb-4" />
      <DepositView from={from} initialAmount={amount} returnTo={returnTo} />
    </>
  );
}
