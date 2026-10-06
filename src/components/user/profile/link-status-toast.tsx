"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "@/lib/toast";

// The Telegram/Discord link callbacks redirect to /profile?link=…&status=…&reason=….
// Nothing read those params, so a failed link was silent. Show it once, then
// strip the params so a refresh doesn't repeat the message.
const REASONS: Record<string, string> = {
  already_linked: "That account is already linked to another RevType account.",
  not_configured: "Account linking isn't available right now.",
  not_logged_in: "Please log in and try again.",
};

export function LinkStatusToast() {
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const platform = params.get("link");
    const status = params.get("status");
    if (!platform || !status) return;
    const name = platform === "telegram" ? "Telegram" : platform === "discord" ? "Discord" : "Account";
    if (status === "ok") {
      toast.success(`${name} linked.`);
    } else {
      const reason = params.get("reason") ?? "";
      toast.error(REASONS[reason] ?? `Couldn't link ${name}. Please try again.`);
    }
    router.replace("/profile", { scroll: false });
  }, [params, router]);

  return null;
}
