// Status-toast helper — maps action semantics to sonner's color variants so
// toast feedback matches the app's dialog colors (Toaster has richColors on):
//   success/approved → green, pending → orange, danger/reject → red, info → blue.
//
//   import { uiToast } from "@/lib/ui-toast";
//   uiToast.success("Approved!");
//   uiToast.pending("Submitted — pending review");
//
// (Named `uiToast` to avoid clashing with the server-side `notifyUser` DB helper.)
import { toast } from "@/lib/toast";

type ToastOpts = Parameters<typeof toast.success>[1];

export const uiToast = {
  /** Green — approved / auto-approved / completed. */
  success: (message: string, opts?: ToastOpts) => toast.success(message, opts),
  /** Orange — pending / awaiting review / caution. */
  pending: (message: string, opts?: ToastOpts) => toast.warning(message, opts),
  /** Red — rejected / deleted / error / danger. */
  danger: (message: string, opts?: ToastOpts) => toast.error(message, opts),
  /** Blue — normal app info. */
  info: (message: string, opts?: ToastOpts) => toast.info(message, opts),
};
