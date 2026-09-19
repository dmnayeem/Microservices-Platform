import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PaymentMethod } from "@/generated/prisma";

// GET /api/payment-methods - Get user's saved payment methods
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const paymentMethods = await prisma.userPaymentMethod.findMany({
      where: { userId: session.user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    // Mask account numbers for security
    const maskedMethods = paymentMethods.map((pm) => ({
      id: pm.id,
      method: pm.method,
      accountNumber: maskAccountNumber(pm.accountNumber),
      accountName: pm.accountName,
      isDefault: pm.isDefault,
      isVerified: pm.isVerified,
      createdAt: pm.createdAt,
    }));

    return NextResponse.json({
      paymentMethods: maskedMethods,
      availableMethods: Object.values(PaymentMethod).map((method) => ({
        method,
        name: getMethodName(method),
        icon: getMethodIcon(method),
        minWithdrawal: getMinWithdrawal(method),
        fee: getFeeInfo(method),
      })),
    });
  } catch (error) {
    console.error("Error fetching payment methods:", error);
    return NextResponse.json(
      { error: "Failed to fetch payment methods" },
      { status: 500 }
    );
  }
}

// POST /api/payment-methods - Add a new payment method
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { method, accountNumber, accountName, setAsDefault } = body;

    // Validate method
    if (!Object.values(PaymentMethod).includes(method)) {
      return NextResponse.json(
        { error: "Invalid payment method" },
        { status: 400 }
      );
    }

    // Validate account number
    if (!accountNumber || accountNumber.length < 5) {
      return NextResponse.json(
        { error: "Invalid account number" },
        { status: 400 }
      );
    }

    // Check for duplicate
    const existing = await prisma.userPaymentMethod.findFirst({
      where: {
        userId: session.user.id,
        method,
        accountNumber,
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "This payment method is already saved" },
        { status: 400 }
      );
    }

    // If setting as default, unset other defaults
    if (setAsDefault) {
      await prisma.userPaymentMethod.updateMany({
        where: {
          userId: session.user.id,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    // Check if this is the first payment method (auto-default)
    const existingCount = await prisma.userPaymentMethod.count({
      where: { userId: session.user.id },
    });

    const paymentMethod = await prisma.userPaymentMethod.create({
      data: {
        userId: session.user.id,
        method,
        accountNumber,
        accountName: accountName || null,
        isDefault: setAsDefault || existingCount === 0,
        isVerified: false,
      },
    });

    return NextResponse.json({
      paymentMethod: {
        id: paymentMethod.id,
        method: paymentMethod.method,
        accountNumber: maskAccountNumber(paymentMethod.accountNumber),
        accountName: paymentMethod.accountName,
        isDefault: paymentMethod.isDefault,
        isVerified: paymentMethod.isVerified,
      },
      message: "Payment method added successfully",
    });
  } catch (error) {
    console.error("Error adding payment method:", error);
    return NextResponse.json(
      { error: "Failed to add payment method" },
      { status: 500 }
    );
  }
}

// DELETE /api/payment-methods - Delete a payment method
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Payment method ID required" },
        { status: 400 }
      );
    }

    // Verify ownership
    const paymentMethod = await prisma.userPaymentMethod.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!paymentMethod) {
      return NextResponse.json(
        { error: "Payment method not found" },
        { status: 404 }
      );
    }

    await prisma.userPaymentMethod.delete({
      where: { id },
    });

    // If this was the default, make another one default
    if (paymentMethod.isDefault) {
      const another = await prisma.userPaymentMethod.findFirst({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
      });

      if (another) {
        await prisma.userPaymentMethod.update({
          where: { id: another.id },
          data: { isDefault: true },
        });
      }
    }

    return NextResponse.json({
      message: "Payment method deleted",
    });
  } catch (error) {
    console.error("Error deleting payment method:", error);
    return NextResponse.json(
      { error: "Failed to delete payment method" },
      { status: 500 }
    );
  }
}

// PATCH /api/payment-methods - Update payment method (set default)
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, setAsDefault } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Payment method ID required" },
        { status: 400 }
      );
    }

    // Verify ownership
    const paymentMethod = await prisma.userPaymentMethod.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!paymentMethod) {
      return NextResponse.json(
        { error: "Payment method not found" },
        { status: 404 }
      );
    }

    if (setAsDefault) {
      // Unset other defaults
      await prisma.userPaymentMethod.updateMany({
        where: {
          userId: session.user.id,
          isDefault: true,
        },
        data: { isDefault: false },
      });

      // Set this as default
      await prisma.userPaymentMethod.update({
        where: { id },
        data: { isDefault: true },
      });
    }

    return NextResponse.json({
      message: "Payment method updated",
    });
  } catch (error) {
    console.error("Error updating payment method:", error);
    return NextResponse.json(
      { error: "Failed to update payment method" },
      { status: 500 }
    );
  }
}

// Helper functions
function maskAccountNumber(number: string): string {
  if (number.length <= 4) return "****";
  return "*".repeat(number.length - 4) + number.slice(-4);
}

function getMethodName(method: PaymentMethod): string {
  const names: Record<PaymentMethod, string> = {
    BKASH: "bKash",
    NAGAD: "Nagad",
    ROCKET: "Rocket",
    BINANCE: "Binance",
    BITGET: "Bitget",
    PAYPAL: "PayPal",
  };
  return names[method];
}

function getMethodIcon(method: PaymentMethod): string {
  const icons: Record<PaymentMethod, string> = {
    BKASH: "📱",
    NAGAD: "📱",
    ROCKET: "🚀",
    BINANCE: "₿",
    BITGET: "₿",
    PAYPAL: "💳",
  };
  return icons[method];
}

function getMinWithdrawal(method: PaymentMethod): number {
  const mins: Record<PaymentMethod, number> = {
    BKASH: 5,
    NAGAD: 5,
    ROCKET: 5,
    BINANCE: 20,
    BITGET: 20,
    PAYPAL: 10,
  };
  return mins[method];
}

function getFeeInfo(method: PaymentMethod): { percentage: number; fixed: number } {
  const fees: Record<PaymentMethod, { percentage: number; fixed: number }> = {
    BKASH: { percentage: 1.5, fixed: 0 },
    NAGAD: { percentage: 1.5, fixed: 0 },
    ROCKET: { percentage: 1.8, fixed: 0 },
    BINANCE: { percentage: 0.5, fixed: 0 },
    BITGET: { percentage: 0.5, fixed: 0 },
    PAYPAL: { percentage: 2.5, fixed: 0 },
  };
  return fees[method];
}
