"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  Edit,
  Pause,
  Play,
  Trash2,
  Copy,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import Link from "next/link";

interface Task {
  id: string;
  title: string;
  status: string;
}

interface TaskActionsProps {
  task: Task;
  canEdit: boolean;
  canDelete: boolean;
  canCreate: boolean;
}

export function TaskActions({ task, canEdit, canDelete, canCreate }: TaskActionsProps) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleStatusChange = async (action: "pause" | "resume") => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/admin/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to ${action} task`);
      }

      toast.success(`Task ${action === "pause" ? "paused" : "resumed"} successfully`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${action} task`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDuplicate = async () => {
    setIsDuplicating(true);
    try {
      const response = await fetch(`/api/admin/tasks/${task.id}/duplicate`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to duplicate task");
      }

      toast.success("Task duplicated successfully");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to duplicate task");
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/tasks/${task.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete task");
      }

      toast.success("Task deleted successfully");
      setShowDeleteModal(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete task");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <Link
          href={`/admin/tasks/${task.id}`}
          className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          title="View"
        >
          <Eye className="w-4 h-4" />
        </Link>

        {canEdit && (
          <>
            <Link
              href={`/admin/tasks/${task.id}/edit`}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              title="Edit"
            >
              <Edit className="w-4 h-4" />
            </Link>

            {task.status === "ACTIVE" && (
              <button
                onClick={() => handleStatusChange("pause")}
                disabled={isUpdating}
                className="p-1.5 text-gray-400 hover:text-amber-400 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
                title="Pause"
              >
                {isUpdating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Pause className="w-4 h-4" />
                )}
              </button>
            )}

            {task.status === "PAUSED" && (
              <button
                onClick={() => handleStatusChange("resume")}
                disabled={isUpdating}
                className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
                title="Resume"
              >
                {isUpdating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </button>
            )}
          </>
        )}

        {canCreate && (
          <button
            onClick={handleDuplicate}
            disabled={isDuplicating}
            className="p-1.5 text-gray-400 hover:text-indigo-400 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
            title="Duplicate"
          >
            {isDuplicating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        )}

        {canDelete && (
          <button
            onClick={() => setShowDeleteModal(true)}
            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-xl border border-gray-800 w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-white">Delete Task</h2>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-400">
                Are you sure you want to delete <span className="text-white font-medium">&quot;{task.title}&quot;</span>?
              </p>
              <p className="text-red-400 text-sm mt-2">
                This action cannot be undone. All submissions for this task will also be affected.
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
                    Delete Task
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

// Actions for task detail page header
interface TaskDetailActionsProps {
  taskId: string;
  taskTitle: string;
  taskStatus: string;
  canEdit: boolean;
  canDelete: boolean;
  canCreate: boolean;
}

export function TaskDetailActions({
  taskId,
  taskTitle,
  taskStatus,
  canEdit,
  canDelete,
  canCreate,
}: TaskDetailActionsProps) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleStatusChange = async (action: "pause" | "resume") => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/admin/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to ${action} task`);
      }

      toast.success(`Task ${action === "pause" ? "paused" : "resumed"} successfully`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${action} task`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDuplicate = async () => {
    setIsDuplicating(true);
    try {
      const response = await fetch(`/api/admin/tasks/${taskId}/duplicate`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to duplicate task");
      }

      toast.success("Task duplicated successfully");
      router.push(`/admin/tasks/${data.task.id}/edit`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to duplicate task");
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/tasks/${taskId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete task");
      }

      toast.success("Task deleted successfully");
      router.push("/admin/tasks");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete task");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="flex gap-2">
        {canEdit && (
          <Link
            href={`/admin/tasks/${taskId}/edit`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Edit className="w-4 h-4" />
            Edit
          </Link>
        )}

        {canCreate && (
          <button
            onClick={handleDuplicate}
            disabled={isDuplicating}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {isDuplicating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            Duplicate
          </button>
        )}

        {canEdit && taskStatus === "ACTIVE" && (
          <button
            onClick={() => handleStatusChange("pause")}
            disabled={isUpdating}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/20 transition-colors disabled:opacity-50"
          >
            {isUpdating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Pause className="w-4 h-4" />
            )}
            Pause
          </button>
        )}

        {canEdit && taskStatus === "PAUSED" && (
          <button
            onClick={() => handleStatusChange("resume")}
            disabled={isUpdating}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
          >
            {isUpdating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Resume
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
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-xl border border-gray-800 w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-white">Delete Task</h2>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-400">
                Are you sure you want to delete <span className="text-white font-medium">&quot;{taskTitle}&quot;</span>?
              </p>
              <p className="text-red-400 text-sm mt-2">
                This action cannot be undone. All submissions for this task will also be affected.
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
                    Delete Task
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
