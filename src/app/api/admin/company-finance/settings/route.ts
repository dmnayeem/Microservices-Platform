import { NextRequest, NextResponse } from "next/server";
import { financeGuard, reply, auditFinance } from "@/lib/company-finance/api";
import { availableCurrencies, saveCategory, saveFieldDef } from "@/lib/company-finance/books";
import { prisma } from "@/lib/prisma";
import { invalidateSettingsCache, primeSetting } from "@/lib/system-settings";

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
    defaultCurrency?: string;
  };

  // The currency a new entry starts in. It was read by the books and editable
  // nowhere — the settings-truth audit caught it. Lives here rather than on the
  // general Settings screen because this is a finance decision, and that
  // screen is editable by admins who are not allowed to see the books.
  if (body.defaultCurrency !== undefined) {
    const code = String(body.defaultCurrency).trim().toUpperCase();
    const known = (await availableCurrencies()).some((c) => c.code === code);
    if (!known) {
      return NextResponse.json(
        { error: `${code || "That"} has no exchange rate set — add it under Settings → Currencies first` },
        { status: 400 }
      );
    }
    const KEY = "finance.default_currency";
    await prisma.systemSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: code, category: "finance" },
      update: { value: code, category: "finance" },
    });
    // Clear, then prime — the read goes through an edge cache that is not ours
    // to clear, so without the prime the change would appear not to save.
    invalidateSettingsCache();
    primeSetting(KEY, code);
    await auditFinance(g.caller, "DEFAULT_CURRENCY_SET", "SystemSetting", KEY, `Set the default entry currency to ${code}`);
    return NextResponse.json({ ok: true, defaultCurrency: code });
  }

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
