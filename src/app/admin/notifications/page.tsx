import { parsePage } from "@/lib/paginate";
import { auth } from "@/lib/auth";
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
import { hasPermission, type UserRole } from "@/lib/rbac";
import { NotificationsList } from "./_components/NotificationsList";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    type?: string;
    search?: string;
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

  const adminRole = session.user.role as UserRole | undefined;
  if (!hasPermission(adminRole, "notifications.view")) {
    redirect("/admin");
  }

  const params = await searchParams;
  const page = parsePage(params.page);
  const pageSize = 20;
  const skip = (page - 1) * pageSize;
  const typeFilter = params.type || "";

  // Build where clause
  const where: Record<string, unknown> = {};
  if (typeFilter) {
    where.type = typeFilter;
  }

  // Fetch notifications with pagination
  const [notifications, totalCount] = await Promise.all([
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
  const canSend = hasPermission(adminRole, "notifications.send");

  const buildQueryString = (newPage: number, newType?: string) => {
    const queryParams = new URLSearchParams();
    queryParams.set("page", newPage.toString());
    if (newType || typeFilter) queryParams.set("type", newType || typeFilter);
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

      {/* Notifications List */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <NotificationsList
          notifications={typedNotifications}
          canSend={canSend}
        />

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
