import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { hasPermission, type UserRole } from "@/lib/rbac";

const MAX_DEPTH = 10;

interface TreeNode {
  id: string;
  name: string | null;
  email: string;
  avatar: string | null;
  level: number;
  packageTier: string;
  referralCode: string;
  joinedAt: string;
  treeDepth: number; // distance from root (root = 0)
  childCount: number;
  totalEarned: number; // sum of ReferralEarning.amount where userId=this user
  children: TreeNode[];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = session.user.role as UserRole | undefined;
  if (!hasPermission(role, "referrals.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const root = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      level: true,
      package: { select: { slug: true, name: true } },
      referralCode: true,
      createdAt: true,
    },
  });
  if (!root) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // BFS the tree by referredById, capped at MAX_DEPTH.
  type Row = (typeof root) & { treeDepth: number };
  const queue: Row[] = [{ ...root, treeDepth: 0 }];
  const collected: Row[] = [{ ...root, treeDepth: 0 }];

  let head = 0;
  while (head < queue.length) {
    const layer = queue.slice(head);
    head = queue.length;
    const parentIds = layer.map((r) => r.id);
    const nextDepth = (layer[0]?.treeDepth ?? 0) + 1;
    if (nextDepth > MAX_DEPTH) break;

    const children = await prisma.user.findMany({
      where: { referredById: { in: parentIds } },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        level: true,
        package: { select: { slug: true, name: true } },
        referralCode: true,
        createdAt: true,
        referredById: true,
      },
    });

    for (const c of children) {
      const node = { ...c, treeDepth: nextDepth };
      queue.push(node);
      collected.push(node);
    }
  }

  // Earnings per user across the tree (for the root only, sum all earnings;
  // for children, sum the child's own ReferralEarning.amount as their tree income).
  const ids = collected.map((c) => c.id);
  const earningsAgg = ids.length
    ? await Promise.all(
        ids.map((uid) =>
          prisma.referralEarning.aggregate({
            where: { userId: uid },
            _sum: { amount: true },
          })
        )
      )
    : [];
  const earningsByUser = new Map(
    ids.map((uid, i) => [uid, toNum(earningsAgg[i]?._sum.amount)])
  );

  // Direct child counts for each node (referrals one level below them).
  const childCountByUser = new Map<string, number>();
  for (const node of collected) {
    childCountByUser.set(node.id, 0);
  }
  // Pull referredById of every collected node and tally
  const allReferredEdges = await prisma.user.findMany({
    where: { referredById: { in: ids } },
    select: { referredById: true },
  });
  for (const e of allReferredEdges) {
    if (e.referredById && childCountByUser.has(e.referredById)) {
      childCountByUser.set(
        e.referredById,
        (childCountByUser.get(e.referredById) ?? 0) + 1
      );
    }
  }

  // Build the nested tree structure
  const byParent = new Map<string | null, TreeNode[]>();
  const nodeMap = new Map<string, TreeNode>();
  for (const r of collected) {
    const node: TreeNode = {
      id: r.id,
      name: r.name,
      email: r.email,
      avatar: r.avatar,
      level: r.level,
      packageTier: r.package?.name ?? "—",
      referralCode: r.referralCode,
      joinedAt: r.createdAt.toISOString(),
      treeDepth: r.treeDepth,
      childCount: childCountByUser.get(r.id) ?? 0,
      totalEarned: earningsByUser.get(r.id) ?? 0,
      children: [],
    };
    nodeMap.set(node.id, node);
    const parent = (r as Row & { referredById?: string | null }).referredById;
    const key = r.treeDepth === 0 ? null : parent ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(node);
  }
  // Wire children
  for (const [key, list] of byParent) {
    if (key === null) continue;
    const parent = nodeMap.get(key);
    if (parent) parent.children = list;
  }

  const rootNode = nodeMap.get(root.id);
  if (!rootNode) {
    return NextResponse.json({ error: "Failed to build tree" }, { status: 500 });
  }

  // Tree-wide stats
  const totalDescendants = collected.length - 1;
  const totalTreeEarnings = collected.reduce(
    (s, n) => s + (earningsByUser.get(n.id) ?? 0),
    0
  );
  const byLevel: Record<number, number> = {};
  for (const n of collected) {
    if (n.treeDepth === 0) continue;
    byLevel[n.treeDepth] = (byLevel[n.treeDepth] ?? 0) + 1;
  }

  return NextResponse.json({
    root: rootNode,
    stats: {
      totalDescendants,
      totalTreeEarnings,
      maxDepth: Math.max(0, ...collected.map((c) => c.treeDepth)),
      byLevel,
    },
  });
}
