import { parsePage } from "@/lib/paginate";
import { formatDistanceToNow } from "date-fns";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  Bell,
  Send,
  Users,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  Wallet,
  Trophy,
  Ticket,
  MessageSquare,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import Link from "next/link";
import { NotificationsList } from "./_components/NotificationsList";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    type?: string;
    search?: string;
    /** "grouped" (default) — one row per message; "all" — one row per person. */
    view?: string;
    /** Drill into one grouped message. */
    title?: string;
  }>;
}

const NOTIFICATION_TYPE_CONFIG: Record<
  string,
  { label: string; icon: typeof Bell; color: string }
> = {
  SYSTEM: { label: "System", icon: AlertCircle, color: "text-gray-400" },
  TASK: { label: "Task", icon: CheckCircle, color: "text-blue-400" },
  WALLET: { label: "Wallet", icon: Wallet, color: "text-emerald-400" },
  REFERRAL: { label: "Referral", icon: Users, color: "text-purple-400" },
  PROMOTION: { label: "Promotion", icon: Megaphone, color: "text-amber-400" },
  ACHIEVEMENT: { label: "Achievement", icon: Trophy, color: "text-yellow-400" },
  LOTTERY: { label: "Lottery", icon: Ticket, color: "text-pink-400" },
  SOCIAL: { label: "Social", icon: MessageSquare, color: "text-indigo-400" },
};

export default async function AdminNotificationsPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!(await can(session.user.id, "notifications.view"))) {
    redirect("/admin");
  }

  const params = await searchParams;
  const page = parsePage(params.page);
  const pageSize = 20;
  const skip = (page - 1) * pageSize;
  const typeFilter = params.type || "";
  const titleFilter = (params.title || "").slice(0, 300);
  // Grouped by default: a message sent to 1,000 people is ONE row here, not a
  // thousand the admin has to scroll past to see anything else. Drilling into
  // a group (or the "Every notification" tab) shows the per-person rows.
  const view: "grouped" | "all" = params.view === "all" || titleFilter ? "all" : "grouped";

  // Build where clause
  const where: Record<string, unknown> = {};
  if (typeFilter) {
    where.type = typeFilter;
  }
  if (titleFilter) {
    where.title = titleFilter;
  }

  type Group = {
    title: string;
    type: string;
    n: number;
    unread: number;
    latest: Date;
    message: string;
    broadcastId: string | null;
  };
  const [groups, groupCount] =
    view === "grouped"
      ? await Promise.all([
          prisma.$queryRaw<Group[]>`
            SELECT title, type::text AS type, COUNT(*)::int AS n,
                   (COUNT(*) FILTER (WHERE NOT "isRead"))::int AS unread,
                   MAX("createdAt") AS latest, MAX(message) AS message,
                   MAX(data->>'broadcastId') AS "broadcastId"
            FROM "Notification"
            WHERE (${typeFilter} = '' OR type::text = ${typeFilter})
            GROUP BY title, type
            ORDER BY MAX("createdAt") DESC
            LIMIT ${pageSize} OFFSET ${skip}`,
          prisma.$queryRaw<Array<{ c: number }>>`
            SELECT COUNT(*)::int AS c FROM (
              SELECT 1 FROM "Notification"
              WHERE (${typeFilter} = '' OR type::text = ${typeFilter})
              GROUP BY title, type) g`.then((x) => x[0]?.c ?? 0),
        ])
      : [[] as Group[], 0];

  // Fetch notifications with pagination
  const [notifications, totalCountAll] = view === "grouped" ? [[], 0] : await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    }),
    prisma.notification.count({ where }),
  ]);
  const totalCount = view === "grouped" ? groupCount : totalCountAll;

  // Type assertion for Prisma Accelerate
  type NotificationWithUser = (typeof notifications)[0] & {
    user: {
      id: string;
      name: string | null;
      email: string;
      avatar: string | null;
    };
  };
  const typedNotifications = notifications as NotificationWithUser[];

  // Get stats
  const [totalNotifications, unreadCount, sentToday] = await Promise.all([
    prisma.notification.count(),
    prisma.notification.count({ where: { isRead: false } }),
    prisma.notification.count({
      where: {
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    }),
  ]);

  // Get unique recipients today
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
  const uniqueRecipientsToday = await prisma.notification.groupBy({
    by: ["userId"],
    where: {
      createdAt: { gte: todayStart },
    },
  });

  const totalPages = Math.ceil(totalCount / pageSize);
  const canSend = await can(session.user.id, "notifications.send");

  const buildQueryString = (newPage: number, newType?: string) => {
    const queryParams = new URLSearchParams();
    queryParams.set("page", newPage.toString());
    if (newType || typeFilter) queryParams.set("type", newType || typeFilter);
    if (view === "all") queryParams.set("view", "all");
    if (titleFilter) queryParams.set("title", titleFilter);
    return queryParams.toString();
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Notifications</h1>
          <p className="text-gray-400 mt-1">
            Manage and send notifications to users
          </p>
        </div>
        {canSend && (
          <Link
            href="/admin/notifications/send"
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            <Send className="w-4 h-4" />
            Send Notification
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <Bell className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{totalNotifications.toLocaleString()}</p>
              <p className="text-sm text-gray-500">Total Sent</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <AlertCircle className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{unreadCount.toLocaleString()}</p>
              <p className="text-sm text-gray-500">Unread</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <Send className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{sentToday.toLocaleString()}</p>
              <p className="text-sm text-gray-500">Sent Today</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <Users className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{uniqueRecipientsToday.length}</p>
              <p className="text-sm text-gray-500">Recipients Today</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/notifications"
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            !typeFilter
              ? "bg-indigo-500 text-white"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
        >
          All Types
        </Link>
        {Object.entries(NOTIFICATION_TYPE_CONFIG).map(([type, config]) => (
          <Link
            key={type}
            href={`/admin/notifications?${buildQueryString(1, type)}`}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              typeFilter === type
                ? "bg-indigo-500 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            <config.icon className={`w-3.5 h-3.5 ${typeFilter === type ? "text-white" : config.color}`} />
            {config.label}
          </Link>
        ))}
      </div>

      {/* View: grouped (one row per message) or every notification */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-gray-800 p-0.5">
          <Link
            href={`/admin/notifications${typeFilter ? `?type=${typeFilter}` : ""}`}
            className={`px-3 py-1.5 rounded-md text-sm ${view === "grouped" ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white"}`}
          >
            Grouped by message
          </Link>
          <Link
            href={`/admin/notifications?view=all${typeFilter ? `&type=${typeFilter}` : ""}`}
            className={`px-3 py-1.5 rounded-md text-sm ${view === "all" && !titleFilter ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white"}`}
          >
            Every notification
          </Link>
        </div>
        {titleFilter && (
          <span className="inline-flex max-w-full items-center gap-2 rounded-lg bg-indigo-500/15 px-3 py-1.5 text-sm text-indigo-200">
            <span className="truncate">Recipients of “{titleFilter}”</span>
            <Link href={`/admin/notifications${typeFilter ? `?type=${typeFilter}` : ""}`} className="text-indigo-300 hover:text-white" aria-label="Back to grouped">
              ✕
            </Link>
          </span>
        )}
      </div>

      {/* Notifications List */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {view === "grouped" ? (
          groups.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500">No notifications.</p>
          ) : (
            <ul className="divide-y divide-gray-800">
              {groups.map((g) => {
                const cfg = NOTIFICATION_TYPE_CONFIG[g.type] ?? NOTIFICATION_TYPE_CONFIG.SYSTEM;
                return (
                  <li key={`${g.type}:${g.title}`}>
                    <Link
                      href={`/admin/notifications?view=all&title=${encodeURIComponent(g.title)}&type=${g.type}`}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-gray-800/40"
                    >
                      <span className="mt-0.5 rounded-lg bg-gray-800 p-2">
                        <cfg.icon className={`h-4 w-4 ${cfg.color}`} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-semibold text-white">{g.title}</span>
                          {g.broadcastId && (
                            <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-bold text-indigo-300">Bulk message</span>
                          )}
                        </span>
                        <span className="mt-0.5 line-clamp-1 block text-sm text-gray-400">{g.message}</span>
                        <span className="mt-1 block text-xs text-gray-500">
                          {cfg.label} · latest {formatDistanceToNow(new Date(g.latest), { addSuffix: true })}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-bold tabular-nums text-white">
                          {g.n.toLocaleString()} {g.n === 1 ? "person" : "people"}
                        </span>
                        <span className="block text-xs tabular-nums text-gray-500">
                          {g.unread > 0 ? `${g.unread.toLocaleString()} unread` : "all read"}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          <NotificationsList
            notifications={typedNotifications}
            canSend={canSend}
          />
        )}

        {/* Pagination */}
        {totalCount > pageSize && (
          <div className="p-4 border-t border-gray-800 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {skip + 1} - {Math.min(skip + pageSize, totalCount)} of {totalCount}
            </p>
            <div className="flex gap-2">
              <Link
                href={page > 1 ? `/admin/notifications?${buildQueryString(page - 1)}` : "#"}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  page > 1
                    ? "bg-gray-800 text-white hover:bg-gray-700"
                    : "bg-gray-800/50 text-gray-600 cursor-not-allowed"
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Link>
              <Link
                href={
                  page < totalPages
                    ? `/admin/notifications?${buildQueryString(page + 1)}`
                    : "#"
                }
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  page < totalPages
                    ? "bg-gray-800 text-white hover:bg-gray-700"
                    : "bg-gray-800/50 text-gray-600 cursor-not-allowed"
                }`}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
