import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import type { UserRole } from "@/generated/prisma";

export type ThreadRole = "BUYER" | "SELLER" | "ADMIN";

/**
 * Resolve a caller's relationship to a marketplace thread. Buyer and seller are
 * matched by id; any admin holding `marketplace.mediate` may join to mediate.
 * Returns `role: null` when the caller has no access.
 */
export async function resolveThreadAccess(
  threadId: string,
  userId: string,
  role: UserRole | undefined
) {
  const thread = await prisma.marketplaceThread.findUnique({
    where: { id: threadId },
  });
  if (!thread) return { thread: null, role: null as ThreadRole | null };
  if (thread.buyerId === userId) return { thread, role: "BUYER" as const };
  if (thread.sellerId === userId) return { thread, role: "SELLER" as const };
  if (role && hasPermission(role, "marketplace.mediate")) {
    return { thread, role: "ADMIN" as const };
  }
  return { thread, role: null as ThreadRole | null };
}
