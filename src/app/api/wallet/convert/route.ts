import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { convertAllPointsToCash } from "@/lib/points-convert";
import { deliverToUser } from "@/lib/notify";

// POST /api/wallet/convert — move the user's ENTIRE points balance into
// withdrawable cash, once they hold at least the admin-set threshold.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withIdempotency(request, session.user.id, async () => {
    const result = await convertAllPointsToCash(session.user.id);

    if (!result.ok) {
      if (result.reason === "BELOW_THRESHOLD") {
        return NextResponse.json(
          {
            error: `You need at least ${result.threshold.toLocaleString()} points to convert. You have ${result.points.toLocaleString()}.`,
          },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: "Balance changed — please try again." },
        { status: 409 }
      );
    }

    void deliverToUser({
      userId: session.user.id,
      title: "Points converted to cash",
      message: `${result.pointsConverted.toLocaleString()} points became $${result.cashAdded.toFixed(2)} in your wallet — ready to withdraw.`,
      link: "/wallet",
    });

    return NextResponse.json({
      success: true,
      pointsConverted: result.pointsConverted,
      cashAdded: result.cashAdded,
      newCash: result.newCash,
      message: `Converted ${result.pointsConverted.toLocaleString()} points to $${result.cashAdded.toFixed(2)}.`,
    });
  });
}
