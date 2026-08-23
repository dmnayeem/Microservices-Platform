"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Edit, Ban, CheckCircle, Unlock, X, Loader2, Download, Plus, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import Link from "next/link";

interface User {
  id: string;
  name: string | null;
  email: string;
  status: string;
  role: string;
}

interface UserActionsProps {
  user: User;
  canEdit: boolean;
  canBan: boolean;
}

export function UserActions({ user, canEdit, canBan }: UserActionsProps) {
  const router = useRouter();
  const [isBanning, setIsBanning] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [showBanModal, setShowBanModal] = useState(false);
  const [banReason, setBanReason] = useState("");

  const handleBan = async () => {
    setIsBanning(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: banReason }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to ban user");
      }

      toast.success("User banned successfully");
      setShowBanModal(false);
      setBanReason("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to ban user");
    } finally {
      setIsBanning(false);
    }
  };

  const handleUnban = async () => {
    setIsBanning(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}/ban`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to unban user");
      }

      toast.success("User unbanned successfully");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unban user");
    } finally {
      setIsBanning(false);
    }
  };

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}/approve`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to approve user");
      }

      toast.success("User approved successfully");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to approve user");
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Link
          href={`/admin/users/${user.id}`}
          className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          title="View Details"
        >
          <Eye className="w-4 h-4" />
        </Link>

        {canEdit && (
          <Link
            href={`/admin/users/${user.id}`}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            title="Edit User"
          >
            <Edit className="w-4 h-4" />
          </Link>
        )}

        {canEdit && user.status === "PENDING_VERIFICATION" && (
          <button
            onClick={handleApprove}
            disabled={isApproving}
            className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
            title="Approve User"
          >
            {isApproving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
          </button>
        )}

        {canBan && user.status === "BANNED" && (
          <button
            onClick={handleUnban}
            disabled={isBanning}
            className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
            title="Unban User"
          >
            {isBanning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Unlock className="w-4 h-4" />
            )}
          </button>
        )}

        {canBan && user.status !== "BANNED" && (
          <button
            onClick={() => setShowBanModal(true)}
            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
            title="Ban User"
          >
            <Ban className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Ban Modal */}
      {showBanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-xl border border-gray-800 w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-white">Ban User</h2>
              <button
                onClick={() => setShowBanModal(false)}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-400 mb-4">
                Are you sure you want to ban <span className="text-white font-medium">{user.name || user.email}</span>?
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Reason (optional)
                </label>
                <textarea
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                  rows={3}
                  placeholder="Enter ban reason..."
                />
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-800">
              <Button
                variant="secondary"
                onClick={() => setShowBanModal(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <button
                onClick={handleBan}
                disabled={isBanning}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isBanning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Banning...
                  </>
                ) : (
                  <>
                    <Ban className="w-4 h-4" />
                    Ban User
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface ExportUsersButtonProps {
  queryParams?: string;
}

export function ExportUsersButton({ queryParams }: ExportUsersButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/admin/users/export?${queryParams || ""}`);

      if (!response.ok) {
        throw new Error("Failed to export users");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `users_export_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("Users exported successfully");
    } catch {
      toast.error("Failed to export users");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
    >
      {isExporting ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Download className="w-4 h-4" />
      )}
      Export
    </button>
  );
}

interface AddUserButtonProps {
  canEdit: boolean;
}

export function AddUserButton({ canEdit }: AddUserButtonProps) {
  if (!canEdit) return null;

  return (
    <Link
      href="/admin/users/new"
      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
    >
      <Plus className="w-4 h-4" />
      Add User
    </Link>
  );
}
