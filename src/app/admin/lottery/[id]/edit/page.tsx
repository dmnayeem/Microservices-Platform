import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { roleCanManageLottery } from "@/lib/lottery-access";
import type { UserRole } from "@/lib/rbac";
import { parseFixedPrizes, parsePrizeTiers } from "@/lib/lottery-prizes";
import { LotteryForm } from "../../_components/LotteryForm";
import { ArrowLeft, Ticket } from "lucide-react";
import Link from "next/link";

/**
 * The edit screen.
 *
 * `LotteryForm` has always had an `isEdit` branch that PUTs to
 * `/api/admin/lottery/[id]` — but no page ever rendered it with a `lottery`
 * prop and no PUT handler existed, so a lottery could never be corrected after
 * it was created. This page and that handler are the missing halves.
 */
export default async function EditLotteryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const adminRole = session.user.role as UserRole | undefined;
  if (!roleCanManageLottery(adminRole)) redirect("/admin/lottery");

  const { id } = await params;
  const [lottery, rolloverCandidates] = await Promise.all([
    prisma.lottery.findUnique({
      where: { id },
      include: { _count: { select: { tickets: true } } },
    }),
    prisma.lottery.findMany({
      where: {
        status: { in: ["UPCOMING", "ACTIVE"] },
        drawDate: { gt: new Date() },
        NOT: { id },
      },
      orderBy: { drawDate: "asc" },
      select: { id: true, title: true, drawDate: true },
      take: 50,
    }),
  ]);
  if (!lottery) notFound();

  // A finished lottery has nothing left to edit — send the admin to the detail
  // page rather than showing a form whose every save would be rejected.
  if (lottery.status === "COMPLETED" || lottery.status === "CANCELLED") {
    redirect(`/admin/lottery/${id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href={`/admin/lottery/${id}`}
          className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gray-800">
            <Ticket className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Edit Lottery</h1>
            <p className="text-gray-400">{lottery.title}</p>
          </div>
        </div>
      </div>

      <LotteryForm
        lottery={{
          id: lottery.id,
          title: lottery.title,
          description: lottery.description,
          startDate: lottery.startDate.toISOString(),
          endDate: lottery.endDate.toISOString(),
          drawDate: lottery.drawDate.toISOString(),
          ticketPrice: lottery.ticketPrice,
          maxTickets: lottery.maxTickets,
          maxTicketsPerUser: lottery.maxTicketsPerUser,
          prizeMode: lottery.prizeMode,
          prizes: parseFixedPrizes(lottery.prizes),
          prizeTiers: parsePrizeTiers(lottery.prizeTiers),
          houseCutPercent: lottery.houseCutPercent,
          poolSeedPoints: lottery.poolSeedPoints,
          poolCapPoints: lottery.poolCapPoints,
          minTickets: lottery.minTickets,
          shortfallAction: lottery.shortfallAction,
          rolloverTargetId: lottery.rolloverTargetId,
          ticketsSold: lottery._count.tickets,
        }}
        rolloverCandidates={rolloverCandidates.map((c) => ({
          ...c,
          drawDate: c.drawDate.toISOString(),
        }))}
      />
    </div>
  );
}
