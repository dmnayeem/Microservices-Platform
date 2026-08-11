import { toast } from "@/lib/toast";
import { notifyCenter } from "@/lib/notify-center";

export const inAppToast = {
  success(message: string, description?: string) {
    return toast.success(message, { description, duration: 4000 });
  },
  error(message: string, description?: string) {
    return toast.error(message, { description, duration: 4000 });
  },
  info(message: string, description?: string) {
    return toast(message, { description, duration: 4000 });
  },
  warning(message: string, description?: string) {
    return toast.warning(message, { description, duration: 4000 });
  },
  // Rewards show a centered, celebratory popup rather than a corner toast.
  reward(amount: number, unit: "pts" | "USD" = "pts", description?: string) {
    return notifyCenter.reward({
      amount,
      unit,
      description: description ?? "Reward credited",
    });
  },
};
