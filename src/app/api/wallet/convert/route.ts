import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { convertPointsToCash } from "@/lib/points-convert";
import { deliverToUser } from "@/lib/notify";

// POST /api/wallet/convert — move points into withdrawable cash, once the user
// holds at least the admin-set threshold. Body `{ points? }` converts a partial
// amount; omit it to convert the entire balance.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withIdempotency(request, session.user.id, async () => {
    const body = await request.json().catch(() => ({}));
    const requested =
      body && typeof body.points === "number" && isFinite(body.points) && body.points > 0
        ? Math.floor(body.points)
        : undefined;

    const result = await convertPointsToCash(session.user.id, requested);

    if (!result.ok) {
      if (result.reason === "BELOW_THRESHOLD") {
        return NextResponse.json(
          {
            error: `You need at least ${result.threshold.toLocaleString()} points to convert. You have ${result.points.toLocaleString()}.`,
          },
          { status: 400 }
        );
      }
      if (result.reason === "TOO_SMALL") {
        return NextResponse.json(
          { error: `Convert at least ${(result.min ?? 0).toLocaleString()} points (worth ~$1).` },
          { status: 400 }
        );
      }
      if (result.reason === "INSUFFICIENT") {
        return NextResponse.json(
          { error: `You only have ${result.points.toLocaleString()} points.` },
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
