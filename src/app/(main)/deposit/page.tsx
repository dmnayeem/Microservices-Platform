import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DepositView } from "@/components/user/wallet/deposit-view";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";

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
      <AdRenderer placement="DEPOSIT_TOP" className="mb-4" />
      <DepositView from={from} />
    </>
  );
}
