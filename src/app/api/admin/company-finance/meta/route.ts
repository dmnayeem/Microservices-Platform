import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { financeGuard } from "@/lib/company-finance/api";
import {
  availableCurrencies,
  defaultCurrency,
  listCategories,
  listFieldDefs,
} from "@/lib/company-finance/books";

export const runtime = "nodejs";

/**
 * Everything the finance screens need to draw a form, in one round trip:
 * categories, currencies, custom fields, the people and payees an entry can be
 * paid to, and what the caller is allowed to do — so the screen can hide a
 * button instead of letting someone press it and read a refusal.
 */
export async function GET() {
  const g = await financeGuard("finance.view");
  if ("res" in g) return g.res;
  const c = g.caller;

  const [categories, currencies, fallbackCurrency, fields, payees, employees] = await Promise.all([
    listCategories({ includeInactive: c.can("finance.settings") }),
    availableCurrencies(),
    defaultCurrency(),
    listFieldDefs(),
    prisma.payee.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, kind: true },
    }),
    // Names only, and only for someone who may see HR — the list alone says
    // who works here, which a data-entry clerk does not need.
    c.can("finance.hr.view")
      ? prisma.employee.findMany({
          where: { status: { not: "LEFT" } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, designation: true },
        })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    categories,
    currencies,
    defaultCurrency: fallbackCurrency,
    fields: fields.map((f) => ({
      id: f.id,
      entity: f.entity,
      categoryId: f.categoryId,
      categoryName: f.category?.name ?? null,
      key: f.key,
      label: f.label,
      type: f.type,
      options: f.options,
      required: f.required,
      isActive: f.isActive,
    })),
    payees,
    employees,
    can: {
      create: c.can("finance.entries.create"),
      approve: c.can("finance.entries.approve"),
      hrView: c.can("finance.hr.view"),
      hrManage: c.can("finance.hr.manage"),
      settings: c.can("finance.settings"),
      staff: c.can("finance.staff"),
    },
    role: c.role,
  });
}
