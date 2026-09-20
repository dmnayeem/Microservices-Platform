"use client";

import { useState, useEffect } from "react";
import {
  Bell,
  CheckCircle,
  Wallet,
  Users,
  AlertCircle,
  Megaphone,
  Trophy,
  Ticket,
  MessageSquare,
  Check,
  CheckCheck,
  Trash2,
  Filter,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { FilterChips } from "@/components/user/primitives/filter-chips";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const NOTIFICATION_TYPE_CONFIG: Record<
  string,
  { label: string; icon: typeof Bell; color: string; bgColor: string }
> = {
  SYSTEM: {
    label: "System",
    icon: AlertCircle,
    color: "text-(--app-ink-3)",
    bgColor: "bg-(--app-ink-3)/10",
  },
  TASK: {
    label: "Task",
    icon: CheckCircle,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  WALLET: {
    label: "Wallet",
    icon: Wallet,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
  REFERRAL: {
    label: "Referral",
    icon: Users,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
  },
  PROMOTION: {
    label: "Promotion",
    icon: Megaphone,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
  },
  ACHIEVEMENT: {
    label: "Achievement",
    icon: Trophy,
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10",
  },
  LOTTERY: {
    label: "Lottery",
    icon: Ticket,
    color: "text-pink-400",
    bgColor: "bg-pink-500/10",
  },
  SOCIAL: {
    label: "Social",
    icon: MessageSquare,
    color: "text-(--app-accent-ink)",
    bgColor: "bg-(--app-cta)/10",
  },
};

const PAGE_SIZE = 20;

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });

  // `silent` skips the loading spinner so background auto-refreshes don't flash.
  const fetchNotifications = async (page: number = 1, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedFilter) params.set("type", selectedFilter);
      if (showUnreadOnly) params.set("unread", "true");
      params.set("page", page.toString());
      params.set("limit", PAGE_SIZE.toString());

      const response = await fetch(`/api/notifications?${params.toString()}`, {
        cache: "no-store",
      });
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
        setPagination(data.pagination || {
          page: 1,
          limit: PAGE_SIZE,
          total: 0,
          totalPages: 0,
        });
      }
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    fetchNotifications(1);
    // fetchNotifications is intentionally not in deps — it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFilter, showUnreadOnly]);

  useEffect(() => {
    fetchNotifications(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  // Live refresh: tab refocus + 15s timer (paused while tab hidden).
  useAutoRefresh(() => fetchNotifications(currentPage, true));

  const handleMarkAsRead = async (notificationIds: string[]) => {
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationIds }),
      });

      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) =>
            notificationIds.includes(n.id) ? { ...n, isRead: true } : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - notificationIds.length));
        setSelectedIds(new Set());
      }
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });

      if (response.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
      }
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  };

  const handleDelete = async (notificationId: string) => {
    try {
      const response = await fetch(
        `/api/notifications?id=${notificationId}`,
        {
          method: "DELETE",
        }
      );

      if (response.ok) {
        setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
        // Refresh if page becomes empty
        if (notifications.length === 1 && currentPage > 1) {
          setCurrentPage(currentPage - 1);
        } else {
          fetchNotifications(currentPage);
        }
      }
    } catch (error) {
      console.error("Error deleting notification:", error);
    }
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkMarkAsRead = () => {
    if (selectedIds.size > 0) {
      handleMarkAsRead(Array.from(selectedIds));
    }
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= pagination.totalPages) {
      setCurrentPage(page);
      setSelectedIds(new Set());
    }
  };

  const filters = [
    { label: "All", type: null },
    ...Object.entries(NOTIFICATION_TYPE_CONFIG).map(([type, config]) => ({
      label: config.label,
      type,
    })),
  ];

  const startItem = (pagination.page - 1) * pagination.limit + 1;
  const endItem = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className="space-y-5">
      <AdRenderer placement="NOTIFICATIONS_TOP" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Notifications</h1>
          <p className="text-(--app-ink-3) mt-1">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}`
              : "You're all caught up!"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUnreadOnly(!showUnreadOnly)}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              showUnreadOnly
                ? "bg-(--app-cta) text-(--app-on-cta)"
                : "bg-(--app-surface-2) text-(--app-ink-3) hover:bg-(--app-surface-2)"
            )}
          >
            <Filter className="w-4 h-4" />
            {showUnreadOnly ? "Unread Only" : "All"}
          </button>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="inline-flex items-center gap-2 px-3 py-2 bg-(--app-surface-2) text-(--app-ink-3) hover:text-white hover:bg-(--app-surface-2) rounded-lg text-sm font-medium transition-colors"
            >
              <CheckCheck className="w-4 h-4" />
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Type Filters */}
      <FilterChips
        value={selectedFilter ?? "ALL"}
        onChange={(v) => setSelectedFilter(v === "ALL" ? null : v)}
        options={filters.map((f) => ({
          value: f.type ?? "ALL",
          label: f.label,
        }))}
      />

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-(--app-cta)/10 border border-(--app-accent-edge)/30 rounded-lg">
          <span className="text-sm text-(--app-accent-ink)">
            {selectedIds.size} selected
          </span>
          <button
            onClick={handleBulkMarkAsRead}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-(--app-cta) text-(--app-on-cta) rounded-lg text-sm font-medium hover:bg-(--app-cta) transition-colors"
          >
            <Check className="w-4 h-4" />
            Mark as read
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-(--app-ink-3) hover:text-white"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Notifications List */}
      {loading ? (
        <ListSkeleton rows={6} />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications"
          description={
            showUnreadOnly
              ? "No unread notifications"
              : "You're all caught up!"
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-(--app-line)">
            {notifications.map((notification) => {
              const typeConfig =
                NOTIFICATION_TYPE_CONFIG[notification.type] ||
                NOTIFICATION_TYPE_CONFIG.SYSTEM;
              const Icon = typeConfig.icon;
              const isSelected = selectedIds.has(notification.id);

              return (
                <div
                  key={notification.id}
                  className={cn(
                    "flex items-start gap-4 p-4 transition-all hover:bg-(--app-surface-2)/50",
                    notification.isRead
                      ? "bg-transparent"
                      : "bg-(--app-cta)/5",
                    isSelected && "ring-2 ring-inset ring-(--app-accent-edge)"
                  )}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelection(notification.id)}
                    className="mt-1 w-4 h-4 rounded border-(--app-line) bg-(--app-surface) text-(--app-accent-ink) focus:ring-(--app-accent-edge)"
                  />

                  {/* Icon */}
                  <div
                    className={cn(
                      "p-2 rounded-lg shrink-0",
                      typeConfig.bgColor
                    )}
                  >
                    <Icon className={cn("w-5 h-5", typeConfig.color)} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-white">
                            {notification.title}
                          </h3>
                          {!notification.isRead && (
                            <span className="w-2 h-2 bg-(--app-cta) rounded-full shrink-0" />
                          )}
                        </div>
                        <p className="text-sm text-(--app-ink-3)">
                          {notification.message}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-(--app-ink-3)">
                          <span className={typeConfig.color}>
                            {typeConfig.label}
                          </span>
                          <span>•</span>
                          <span>
                            {formatDistanceToNow(
                              new Date(notification.createdAt)
                            )}{" "}
                            ago
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {!notification.isRead && (
                          <button
                            onClick={() => handleMarkAsRead([notification.id])}
                            className="p-1.5 text-(--app-ink-3) hover:text-(--app-accent-ink) hover:bg-(--app-surface-2) rounded transition-colors"
                            title="Mark as read"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(notification.id)}
                          className="p-1.5 text-(--app-ink-3) hover:text-red-400 hover:bg-(--app-surface-2) rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {pagination.total > PAGE_SIZE && (
            <div className="p-4 border-t border-(--app-line) flex items-center justify-between">
              <p className="text-sm text-(--app-ink-3)">
                Showing {startItem} - {endItem} of {pagination.total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className={cn(
                    "inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors",
                    currentPage > 1
                      ? "bg-(--app-surface-2) text-white hover:bg-(--app-surface-2)"
                      : "bg-(--app-surface-2)/50 text-(--app-ink-3) cursor-not-allowed"
                  )}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= pagination.totalPages}
                  className={cn(
                    "inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors",
                    currentPage < pagination.totalPages
                      ? "bg-(--app-surface-2) text-white hover:bg-(--app-surface-2)"
                      : "bg-(--app-surface-2)/50 text-(--app-ink-3) cursor-not-allowed"
                  )}
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
