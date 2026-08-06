import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEnabledDepositMethods } from "@/lib/deposit-methods";

// GET /api/deposits/methods — enabled manual/Binance methods a user can pay to
// (label + receiving account + instructions + limits).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const methods = await getEnabledDepositMethods();
  return NextResponse.json({ methods });
}
