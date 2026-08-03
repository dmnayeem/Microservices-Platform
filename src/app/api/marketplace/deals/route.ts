import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { proposeDeal } from "@/lib/marketplace-deal";
import { z } from "zod";

const schema = z.object({
  threadId: z.string().min(1),
  amount: z.number().positive(),
  adminMediated: z.boolean().optional(),
});

// POST /api/marketplace/deals — propose deal terms in a thread (buyer or seller).
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const v = schema.safeParse(await request.json());
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const result = await proposeDeal({
    threadId: v.data.threadId,
    proposerId: session.user.id,
    amount: v.data.amount,
    adminMediated: !!v.data.adminMediated,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }
  return NextResponse.json({ dealId: result.dealId });
}
