import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";

// GET /api/marketplace/orders/:id - Get purchase details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const purchase = await prisma.marketplacePurchase.findUnique({
      where: { id },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            description: true,
            images: true,
            files: true,
            price: true,
            category: true,
            sellerId: true,
            seller: {
              select: {
                id: true,
                name: true,
                avatar: true,
                email: true,
              },
            },
          },
        },
        buyer: {
          select: {
            id: true,
            name: true,
            avatar: true,
            email: true,
          },
        },
      },
    });

    if (!purchase) {
      return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
    }

    // Check if user is buyer or seller
    const isBuyer = purchase.buyerId === session.user.id;
    const isSeller = purchase.listing.sellerId === session.user.id;

    if (!isBuyer && !isSeller) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Only show files to buyer after purchase
    const files = isBuyer ? purchase.listing.files : null;

    return NextResponse.json({
      purchase: {
        id: purchase.id,
        listing: {
          id: purchase.listing.id,
          title: purchase.listing.title,
          description: purchase.listing.description,
          images: purchase.listing.images,
          files,
          category: purchase.listing.category,
          price: toNum(purchase.listing.price),
        },
        buyer: isSeller ? purchase.buyer : undefined,
        seller: isBuyer ? purchase.listing.seller : undefined,
        amount: toNum(purchase.amount),
        fee: toNum(purchase.fee),
        sellerAmount: toNum(purchase.sellerAmount),
        status: purchase.status,
        createdAt: purchase.createdAt,
      },
      role: isBuyer ? "buyer" : "seller",
    });
  } catch (error) {
    console.error("Error fetching purchase:", error);
    return NextResponse.json(
      { error: "Failed to fetch purchase" },
      { status: 500 }
    );
  }
}
