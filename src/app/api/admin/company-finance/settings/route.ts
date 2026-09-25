import { NextRequest, NextResponse } from "next/server";
import { financeGuard, reply, auditFinance } from "@/lib/company-finance/api";
import { saveCategory, saveFieldDef } from "@/lib/company-finance/books";

export const runtime = "nodejs";

/**
 * Categories and custom fields — the part of the books the owner shapes.
 *
 * `{ category: {...} }` or `{ field: {...} }`, with an `id` to edit. Nothing is
 * ever deleted from here: a category or field that is no longer wanted is
 * switched off, because old entries still point at it and still hold values
 * under its key.
 */
export async function POST(request: NextRequest) {
  const g = await financeGuard("finance.settings");
  if ("res" in g) return g.res;
  const body = (await request.json().catch(() => ({}))) as {
    category?: Parameters<typeof saveCategory>[0];
    field?: Parameters<typeof saveFieldDef>[0];
  };

  if (body.category) {
    const res = await saveCategory(body.category);
    if (res.ok) {
      await auditFinance(g.caller, body.category.id ? "CATEGORY_EDITED" : "CATEGORY_CREATED", "FinanceCategory",
        res.data.id, `${body.category.id ? "Edited" : "Added"} category "${body.category.name}"`);
    }
    return reply(res, body.category.id ? 200 : 201);
  }

  if (body.field) {
    const res = await saveFieldDef(body.field);
    if (res.ok) {
      await auditFinance(g.caller, body.field.id ? "FIELD_EDITED" : "FIELD_CREATED", "FinanceFieldDef",
        res.data.id, `${body.field.id ? "Edited" : "Added"} custom field "${body.field.label}" on ${body.field.entity.toLowerCase()}`);
    }
    return reply(res, body.field.id ? 200 : 201);
  }

  return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
}
