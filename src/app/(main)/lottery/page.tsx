import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LotteryView } from "@/components/user/lottery/lottery-view";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";

export default async function LotteryPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <>
      <AdRenderer placement="LOTTERY_TOP" className="mb-4" />
      <LotteryView />
    </>
  );
}
