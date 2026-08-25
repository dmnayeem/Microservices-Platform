import { toNum } from "@/lib/money";
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
import { csvCell, csvResponse, toCsv } from "@/lib/csv";

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
        [...baseHeaders, ...questionHeaders].map(csvCell).join(",") + "\n";

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
          return cells.map(csvCell).join(",");
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
      // Built through the shared escaper. These rows used to be raw template
      // literals that wrapped values in quotes WITHOUT doubling the inner ones,
      // so a single `"` in somebody's name silently corrupted the file from
      // that row onward — and a comma in a country name shifted every later
      // column. `toNum` first because these are Prisma Decimals.
      csvContent = toCsv(
        ["ID", "Email", "Name", "Created At", "Status", "Package", "Points Balance", "Cash Balance", "Total Earnings", "Total Withdrawals", "Referral Code", "Country", "Last Login"],
        (users as unknown as UserExport[]).map((u) => [
          u.id,
          u.email,
          u.name || "",
          format(u.createdAt, "yyyy-MM-dd HH:mm:ss"),
          u.status,
          u.package?.name ?? "",
          u.pointsBalance,
          toNum(u.cashBalance).toFixed(2),
          toNum(u.totalEarnings).toFixed(2),
          toNum(u.totalWithdrawals).toFixed(2),
          u.referralCode,
          u.country || "",
          u.lastLoginAt ? format(u.lastLoginAt, "yyyy-MM-dd HH:mm:ss") : "",
        ])
      );
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

      // Task titles are user-authored and routinely contain commas and quotes.
      csvContent = toCsv(
        ["ID", "User Email", "User Name", "Task Title", "Task Type", "Status", "Points Earned", "XP Earned", "Submitted At", "Reviewed At"],
        submissions.map((s) => [
          s.id,
          s.user.email,
          s.user.name || "",
          s.task.title,
          s.task.type,
          s.status,
          s.pointsEarned || 0,
          s.xpEarned || 0,
          format(s.createdAt, "yyyy-MM-dd HH:mm:ss"),
          s.reviewedAt ? format(s.reviewedAt, "yyyy-MM-dd HH:mm:ss") : "",
        ])
      );
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

      // Interpolating a Prisma Decimal yields its raw 6-dp string, so the CSV
      // and the UI disagreed by a cent on halves. toNum, then fix to 2.
      csvContent = toCsv(
        ["ID", "User Email", "User Name", "Amount", "Fee", "Net Amount", "Method", "Status", "Created At", "Processed At"],
        withdrawals.map((w) => [
          w.id,
          w.user.email,
          w.user.name || "",
          toNum(w.amount).toFixed(2),
          toNum(w.fee).toFixed(2),
          toNum(w.netAmount).toFixed(2),
          w.method,
          w.status,
          format(w.createdAt, "yyyy-MM-dd HH:mm:ss"),
          w.processedAt ? format(w.processedAt, "yyyy-MM-dd HH:mm:ss") : "",
        ])
      );
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

      // `description` is free text written by a dozen code paths and is the
      // field most likely to carry a comma or a quote.
      csvContent = toCsv(
        ["ID", "User Email", "User Name", "Type", "Status", "Points", "Amount", "Description", "Reference", "Created At"],
        transactions.map((t) => [
          t.id,
          t.user.email,
          t.user.name || "",
          t.type,
          t.status,
          t.points,
          toNum(t.amount).toFixed(6),
          t.description || "",
          t.reference || "",
          format(t.createdAt, "yyyy-MM-dd HH:mm:ss"),
        ])
      );
    } else if (reportType === "traffic") {
      // Page/task-page traffic export (from the PageDailyStat rollup).
      const from = startOfDay(startDate);
      // Prisma groupBy generics degrade to `{}` in this tuple — declare shapes.
      type TSum = { views: number | null; uniqueVisitors: number | null; totalDwellSec: number | null };
      const [pages, taskPages] = (await Promise.all([
        prisma.pageDailyStat.groupBy({
          by: ["key"],
          where: { kind: "PAGE", date: { gte: from } },
          _sum: { views: true, uniqueVisitors: true, totalDwellSec: true },
          orderBy: { _sum: { views: "desc" } },
          take: 500,
        }),
        prisma.pageDailyStat.groupBy({
          by: ["key", "label"],
          where: { kind: "TASK", date: { gte: from } },
          _sum: { views: true, uniqueVisitors: true, totalDwellSec: true },
          orderBy: { _sum: { views: "desc" } },
          take: 500,
        }),
      ])) as unknown as [
        Array<{ key: string; _sum: TSum }>,
        Array<{ key: string; label: string | null; _sum: TSum }>,
      ];
      const taskIds = taskPages.map((t) => t.key);
      const taskRows = taskIds.length
        ? await prisma.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, title: true } })
        : [];
      const titleById = new Map(taskRows.map((t) => [t.id, t.title]));
      const avg = (d: number | null, v: number | null) => (v && v > 0 ? Math.round((d ?? 0) / v) : 0);

      csvContent = "Kind,Page/Task,Views,Unique Visitors,Avg Time (s)\n";
      csvContent += pages
        .map((p) =>
          [
            "PAGE",
            p.key,
            p._sum.views ?? 0,
            p._sum.uniqueVisitors ?? 0,
            avg(p._sum.totalDwellSec, p._sum.views),
          ]
            .map((c) => csvCell(String(c)))
            .join(",")
        )
        .join("\n");
      if (taskPages.length) {
        csvContent +=
          "\n" +
          taskPages
            .map((t) =>
              [
                `TASK:${t.label ?? ""}`,
                titleById.get(t.key) ?? t.key,
                t._sum.views ?? 0,
                t._sum.uniqueVisitors ?? 0,
                avg(t._sum.totalDwellSec, t._sum.views),
              ]
                .map((c) => csvCell(String(c)))
                .join(",")
            )
            .join("\n");
      }
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
            // Decimals → numbers before they cross the JSON/CSV boundary
            // (a raw Decimal serializes as a string).
            withdrawalAmount: toNum(withdrawals._sum.amount ?? 0),
            referralEarnings: toNum(referralEarnings._sum.amount ?? 0),
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

    // csvResponse adds the UTF-8 BOM. Without it Excel reads the file as the
    // local codepage and every Bengali name in it comes out as mojibake.
    return csvResponse(csvContent, filename);
  } catch (error) {
    console.error("Error exporting analytics:", error);
    return NextResponse.json(
      { error: "Failed to export analytics" },
      { status: 500 }
    );
  }
}
