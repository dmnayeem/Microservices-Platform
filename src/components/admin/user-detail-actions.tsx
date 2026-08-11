"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Edit,
  Ban,
  Unlock,
  X,
  Loader2,
  Plus,
  Minus,
  Trash2,
  LogIn,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

interface UserDetailActionsProps {
  userId: string;
  userName: string | null;
  userEmail: string;
  userStatus: string;
  canEdit: boolean;
  canBan: boolean;
  canDelete: boolean;
  canImpersonate: boolean;
  canApprove?: boolean;
  /** Auto-open a modal on mount — driven by the list table's ?ban=1/?delete=1 links. */
  initialAction?: "ban" | "delete";
}

export function UserDetailActions({
  userId,
  userName,
  userEmail,
  userStatus,
  canEdit,
  canBan,
  canDelete,
  canImpersonate,
  canApprove = false,
  initialAction,
}: UserDetailActionsProps) {
  const router = useRouter();
  const [isBanning, setIsBanning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [showBanModal, setShowBanModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showImpersonateModal, setShowImpersonateModal] = useState(false);
  const [banReason, setBanReason] = useState("");

  // Open the ban/delete modal when arriving from the list table's action links.
  useEffect(() => {
    if (initialAction === "ban" && canBan && userStatus !== "BANNED") {
      setShowBanModal(true);
    } else if (initialAction === "delete" && canDelete) {
      setShowDeleteModal(true);
    }
    // Run once on mount for the given initial action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAction]);

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}/approve`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to approve user");
      }
      toast.success("User approved");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to approve user"
      );
    } finally {
      setIsApproving(false);
    }
  };

  const handleBan = async () => {
    setIsBanning(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}/ban`, {
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
      const response = await fetch(`/api/admin/users/${userId}/ban`, {
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

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete user");
      }

      toast.success("User deleted successfully");
      router.push("/admin/users");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete user");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleImpersonate = async () => {
    setIsImpersonating(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}/impersonate`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to impersonate user");
      }

      toast.success(`Opening new tab as ${userName || userEmail}...`);
      setShowImpersonateModal(false);

      // Open impersonation in a new tab
      window.open(`/impersonate?token=${data.token}`, '_blank');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to impersonate user");
    } finally {
      setIsImpersonating(false);
    }
  };

  return (
    <>
      <div className="flex gap-2">
        {canApprove && userStatus === "PENDING_VERIFICATION" && (
          <button
            onClick={handleApprove}
            disabled={isApproving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50"
          >
            {isApproving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            Approve
          </button>
        )}
        {canEdit && (
          <Link
            href={`/admin/users/${userId}/edit`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Edit className="w-4 h-4" />
            Edit
          </Link>
        )}
        {canBan && userStatus === "BANNED" && (
          <button
            onClick={handleUnban}
            disabled={isBanning}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
          >
            {isBanning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Unlock className="w-4 h-4" />
            )}
            Unban User
          </button>
        )}
        {canBan && userStatus !== "BANNED" && (
          <button
            onClick={() => setShowBanModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors"
          >
            <Ban className="w-4 h-4" />
            Ban User
          </button>
        )}
        {canDelete && (
          <button
            onClick={() => setShowDeleteModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        )}
        {canImpersonate && (
          <button
            onClick={() => setShowImpersonateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 rounded-lg hover:bg-indigo-500/20 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Login as User
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
                Are you sure you want to ban <span className="text-white font-medium">{userName || userEmail}</span>?
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

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-xl border border-gray-800 w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-white">Delete User</h2>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-400 mb-2">
                Are you sure you want to delete <span className="text-white font-medium">{userName || userEmail}</span>?
              </p>
              <p className="text-red-400 text-sm">
                This action cannot be undone. The user account will be permanently removed.
              </p>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-800">
              <Button
                variant="secondary"
                onClick={() => setShowDeleteModal(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete User
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Impersonate Modal */}
      {showImpersonateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-xl border border-gray-800 w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <div className="flex items-center gap-3">
                <LogIn className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-semibold text-white">Login as User</h2>
              </div>
              <button
                onClick={() => setShowImpersonateModal(false)}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-400 mb-4">
                You are about to login as <span className="text-white font-medium">{userName || userEmail}</span>.
              </p>
              <p className="text-amber-400 text-sm">
                This will log you out from your current session and log you in as this user. You can return to your admin account by logging out and logging back in.
              </p>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-800">
              <Button
                variant="secondary"
                onClick={() => setShowImpersonateModal(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <button
                onClick={handleImpersonate}
                disabled={isImpersonating}
                className="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isImpersonating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Logging in...
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    Login as User
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

interface AdjustBalanceButtonProps {
  userId: string;
  type: "points" | "cash" | "level" | "xp";
  action: "add" | "deduct";
  canAdjust: boolean;
}

export function AdjustBalanceButton({
  userId,
  type,
  action,
  canAdjust,
}: AdjustBalanceButtonProps) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  if (!canAdjust) return null;

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}/balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          action,
          amount: parseFloat(amount),
          reason,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to adjust balance");
      }

      toast.success(`Balance ${action === "add" ? "added" : "deducted"} successfully`);
      setShowModal(false);
      setAmount("");
      setReason("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to adjust balance");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={`p-1 text-gray-400 hover:${action === "add" ? "text-emerald-400" : "text-red-400"} transition-colors`}
        title={`${action === "add" ? "Add" : "Deduct"} ${type}`}
      >
        {action === "add" ? <Plus className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-xl border border-gray-800 w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-white">
                {action === "add" ? "Add" : "Deduct"}{" "}
                {type === "points"
                  ? "Points"
                  : type === "cash"
                  ? "Cash"
                  : type === "level"
                  ? "Level"
                  : "XP"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Amount *
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="0"
                  step={type === "cash" ? "0.01" : "1"}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder={type === "points" ? "Enter points" : "Enter amount"}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Reason
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter reason"
                />
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-800">
              <Button
                variant="secondary"
                onClick={() => setShowModal(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                isLoading={isSubmitting}
                className="flex-1"
              >
                {action === "add" ? "Add" : "Deduct"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
