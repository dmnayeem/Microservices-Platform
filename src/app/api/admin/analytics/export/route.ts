import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { subDays, startOfDay, endOfDay, format } from "date-fns";
import {
  type SurveyConfig,
  type SurveyAnswers,
  type SurveyQuestion,
  formatAnswerForDisplay,
} from "@/lib/survey-tasks";

function csvEscape(s: string): string {
  return `"${(s ?? "").replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "analytics.export"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get("period") || "30d";
    const reportType = searchParams.get("type") || "summary";

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    let days: number;

    switch (period) {
      case "7d":
        startDate = subDays(now, 7);
        days = 7;
        break;
      case "90d":
        startDate = subDays(now, 90);
        days = 90;
        break;
      default: // 30d
        startDate = subDays(now, 30);
        days = 30;
    }

    let csvContent = "";
    let exportFilename: string | null = null;

    if (reportType === "survey-responses") {
      const taskId = searchParams.get("taskId");
      if (!taskId) {
        return NextResponse.json(
          { error: "taskId is required for survey-responses export" },
          { status: 400 }
        );
      }
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { id: true, title: true, type: true, surveyConfig: true },
      });
      if (!task) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }
      if (task.type !== "SURVEY") {
        return NextResponse.json(
          { error: "Not a survey task" },
          { status: 400 }
        );
      }
      const cfg = task.surveyConfig as SurveyConfig | null;
      const questions: SurveyQuestion[] = Array.isArray(cfg?.questions)
        ? [...(cfg!.questions as SurveyQuestion[])].sort(
            (a, b) => a.order - b.order
          )
        : [];

      const submissions = await prisma.taskSubmission.findMany({
        where: { taskId },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      type SubWithUser = (typeof submissions)[0] & {
        user: { id: string; email: string; name: string | null };
      };
      const rows = submissions as SubWithUser[];

      const baseHeaders = [
        "Submission ID",
        "User ID",
        "User Name",
        "Email",
        "Submitted At",
        "Status",
        "Reviewed At",
        "Points Earned",
        "XP Earned",
      ];
      const questionHeaders = questions.map((q) => q.prompt);
      csvContent =
        [...baseHeaders, ...questionHeaders].map(csvEscape).join(",") + "\n";

      csvContent += rows
        .map((s) => {
          const a = (s.answers ?? null) as SurveyAnswers | null;
          const cells: string[] = [
            s.id,
            s.user.id,
            s.user.name ?? "",
            s.user.email,
            format(s.createdAt, "yyyy-MM-dd HH:mm:ss"),
            s.status,
            s.reviewedAt ? format(s.reviewedAt, "yyyy-MM-dd HH:mm:ss") : "",
            String(s.pointsEarned ?? 0),
            String(s.xpEarned ?? 0),
            ...questions.map((q) =>
              a ? formatAnswerForDisplay(q, a[q.id]) : ""
            ),
          ];
          return cells.map(csvEscape).join(",");
        })
        .join("\n");

      exportFilename = `earngpt-survey-${taskId}-responses-${format(now, "yyyy-MM-dd")}.csv`;
    } else if (reportType === "users") {
      // User analytics export
      const users = await prisma.user.findMany({
        where: { createdAt: { gte: startDate } },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          status: true,
          package: { select: { slug: true, name: true } },
          pointsBalance: true,
          cashBalance: true,
          totalEarnings: true,
          totalWithdrawals: true,
          referralCode: true,
          country: true,
          lastLoginAt: true,
        },
        orderBy: { createdAt: "desc" },
      });

      type UserExport = (typeof users)[number] & {
        package: { slug: string; name: string } | null;
      };
      csvContent = "ID,Email,Name,Created At,Status,Package,Points Balance,Cash Balance,Total Earnings,Total Withdrawals,Referral Code,Country,Last Login\n";
      csvContent += (users as unknown as UserExport[])
        .map(
          (u) =>
            `"${u.id}","${u.email}","${u.name || ""}","${format(u.createdAt, "yyyy-MM-dd HH:mm:ss")}","${u.status}","${u.package?.name ?? ""}",${u.pointsBalance},${u.cashBalance},${u.totalEarnings},${u.totalWithdrawals},"${u.referralCode}","${u.country || ""}","${u.lastLoginAt ? format(u.lastLoginAt, "yyyy-MM-dd HH:mm:ss") : ""}"`
        )
        .join("\n");
    } else if (reportType === "tasks") {
      // Task submissions export
      const submissionsData = await prisma.taskSubmission.findMany({
        where: { createdAt: { gte: startDate } },
        include: {
          user: { select: { email: true, name: true } },
          task: { select: { title: true, type: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      // Type assertion for Prisma Accelerate
      type SubmissionWithRelations = typeof submissionsData[0] & {
        user: { email: string; name: string | null };
        task: { title: string; type: string };
      };
      const submissions = submissionsData as SubmissionWithRelations[];

      csvContent = "ID,User Email,User Name,Task Title,Task Type,Status,Points Earned,XP Earned,Submitted At,Reviewed At\n";
      csvContent += submissions
        .map(
          (s) =>
            `"${s.id}","${s.user.email}","${s.user.name || ""}","${s.task.title}","${s.task.type}","${s.status}",${s.pointsEarned || 0},${s.xpEarned || 0},"${format(s.createdAt, "yyyy-MM-dd HH:mm:ss")}","${s.reviewedAt ? format(s.reviewedAt, "yyyy-MM-dd HH:mm:ss") : ""}"`
        )
        .join("\n");
    } else if (reportType === "withdrawals") {
      // Withdrawals export
      const withdrawalsData = await prisma.withdrawal.findMany({
        where: { createdAt: { gte: startDate } },
        include: {
          user: { select: { email: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      // Type assertion for Prisma Accelerate
      type WithdrawalWithRelations = typeof withdrawalsData[0] & {
        user: { email: string; name: string | null };
      };
      const withdrawals = withdrawalsData as WithdrawalWithRelations[];

      csvContent = "ID,User Email,User Name,Amount,Fee,Net Amount,Method,Status,Created At,Processed At\n";
      csvContent += withdrawals
        .map(
          (w) =>
            `"${w.id}","${w.user.email}","${w.user.name || ""}",${w.amount},${w.fee},${w.netAmount},"${w.method}","${w.status}","${format(w.createdAt, "yyyy-MM-dd HH:mm:ss")}","${w.processedAt ? format(w.processedAt, "yyyy-MM-dd HH:mm:ss") : ""}"`
        )
        .join("\n");
    } else if (reportType === "transactions") {
      // Transactions export
      const transactionsData = await prisma.transaction.findMany({
        where: { createdAt: { gte: startDate } },
        include: {
          user: { select: { email: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      // Type assertion for Prisma Accelerate
      type TransactionWithRelations = typeof transactionsData[0] & {
        user: { email: string; name: string | null };
      };
      const transactions = transactionsData as TransactionWithRelations[];

      csvContent = "ID,User Email,User Name,Type,Status,Points,Amount,Description,Reference,Created At\n";
      csvContent += transactions
        .map(
          (t) =>
            `"${t.id}","${t.user.email}","${t.user.name || ""}","${t.type}","${t.status}",${t.points},${t.amount},"${t.description || ""}","${t.reference || ""}","${format(t.createdAt, "yyyy-MM-dd HH:mm:ss")}"`
        )
        .join("\n");
    } else {
      // Summary report (daily metrics)
      const dailyData = await Promise.all(
        Array.from({ length: days }, async (_, i) => {
          const date = subDays(now, days - 1 - i);
          const dayStart = startOfDay(date);
          const dayEnd = endOfDay(date);

          const [newUsers, completedTasks, withdrawals, referralEarnings] =
            await Promise.all([
              prisma.user.count({
                where: { createdAt: { gte: dayStart, lte: dayEnd } },
              }),
              prisma.taskSubmission.count({
                where: {
                  status: "APPROVED",
                  createdAt: { gte: dayStart, lte: dayEnd },
                },
              }),
              prisma.withdrawal.aggregate({
                where: {
                  status: "COMPLETED",
                  createdAt: { gte: dayStart, lte: dayEnd },
                },
                _sum: { amount: true },
                _count: { id: true },
              }),
              prisma.referralEarning.aggregate({
                where: { createdAt: { gte: dayStart, lte: dayEnd } },
                _sum: { amount: true },
              }),
            ]);

          return {
            date: format(date, "yyyy-MM-dd"),
            newUsers,
            completedTasks,
            withdrawalCount: withdrawals._count.id,
            withdrawalAmount: withdrawals._sum.amount || 0,
            referralEarnings: referralEarnings._sum.amount || 0,
          };
        })
      );

      csvContent = "Date,New Users,Completed Tasks,Withdrawal Count,Withdrawal Amount,Referral Earnings\n";
      csvContent += dailyData
        .map(
          (d) =>
            `${d.date},${d.newUsers},${d.completedTasks},${d.withdrawalCount},${d.withdrawalAmount},${d.referralEarnings}`
        )
        .join("\n");
    }

    // Return CSV file
    const filename =
      exportFilename ??
      `earngpt-${reportType}-report-${format(now, "yyyy-MM-dd")}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Error exporting analytics:", error);
    return NextResponse.json(
      { error: "Failed to export analytics" },
      { status: 500 }
    );
  }
}
