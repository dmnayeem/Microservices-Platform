"use client";

import type { BuilderState } from "../types";
import { Field, SectionHeader, inputCls } from "../shared";
import { ShieldCheck, AlertCircle } from "lucide-react";
import { DateField } from "@/components/ui/date-field";

interface Props {
  state: BuilderState;
  update: <K extends keyof BuilderState>(key: K, value: BuilderState[K]) => void;
  canSetCommission: boolean;
}

export function PricingStep({ state, update, canSetCommission }: Props) {
  return (
    <div className="space-y-5">
      <SectionHeader
        title="Pricing"
        subtitle="Free courses are accessible to all enrolled users. Paid courses are charged from the buyer's wallet balance at checkout."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => update("isFree", true)}
          className={
            "p-4 rounded-xl border-2 text-left transition " +
            (state.isFree
              ? "border-emerald-500 bg-emerald-500/10"
              : "border-slate-700 bg-slate-950 hover:bg-slate-900")
          }
        >
          <p className="text-white font-bold">Free course</p>
          <p className="text-xs text-slate-400 mt-1">
            Anyone can enrol at no cost. Still earns you reach + reviews.
          </p>
        </button>
        <button
          type="button"
          onClick={() => update("isFree", false)}
          className={
            "p-4 rounded-xl border-2 text-left transition " +
            (!state.isFree
              ? "border-indigo-500 bg-indigo-500/10"
              : "border-slate-700 bg-slate-950 hover:bg-slate-900")
          }
        >
          <p className="text-white font-bold">Paid course</p>
          <p className="text-xs text-slate-400 mt-1">
            Charged from the buyer&apos;s wallet. Tutor commission applies.
          </p>
        </button>
      </div>

      {!state.isFree && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Price" required>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                  $
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={state.price}
                  onChange={(e) =>
                    update("price", parseFloat(e.target.value) || 0)
                  }
                  className={inputCls + " pl-7 tabular-nums"}
                />
              </div>
            </Field>
            <Field
              label="Original price"
              hint="Optional — strikethrough on the card"
            >
              <input
                type="number"
                min={0}
                step={0.01}
                value={state.originalPrice ?? ""}
                onChange={(e) =>
                  update(
                    "originalPrice",
                    e.target.value === "" ? null : parseFloat(e.target.value)
                  )
                }
                className={inputCls + " tabular-nums"}
                placeholder="—"
              />
            </Field>
            <Field
              label="Discount price"
              hint="Optional — sale price, used as the live price"
            >
              <input
                type="number"
                min={0}
                step={0.01}
                value={state.discountPrice ?? ""}
                onChange={(e) =>
                  update(
                    "discountPrice",
                    e.target.value === "" ? null : parseFloat(e.target.value)
                  )
                }
                className={inputCls + " tabular-nums"}
                placeholder="—"
              />
            </Field>
          </div>

          <Field
            label="Discount ends at"
            hint="Optional — after this date the price reverts to the standard price."
          >
            <DateField
              type="date"
              value={state.discountEndsAt}
              onChange={(v) => update("discountEndsAt", v)}
              className={inputCls}
            />
          </Field>

          <Field
            label="Affiliate reward (optional)"
            hint="Let others promote this course and earn a reward per sale they drive — paid from your cut. Leave off to disable."
          >
            <div className="flex items-center gap-2">
              <select
                value={state.affiliateCommissionType ?? ""}
                onChange={(e) =>
                  update(
                    "affiliateCommissionType",
                    (e.target.value || null) as BuilderState["affiliateCommissionType"]
                  )
                }
                className={inputCls + " max-w-40"}
              >
                <option value="">No affiliate</option>
                <option value="PERCENT">% of sale</option>
                <option value="FIXED">Fixed $</option>
              </select>
              {state.affiliateCommissionType && (
                <input
                  type="number"
                  min={0}
                  step={state.affiliateCommissionType === "PERCENT" ? 1 : 0.01}
                  value={state.affiliateCommissionValue ?? ""}
                  onChange={(e) =>
                    update(
                      "affiliateCommissionValue",
                      e.target.value === "" ? null : parseFloat(e.target.value)
                    )
                  }
                  className={inputCls + " max-w-32 tabular-nums"}
                  placeholder={
                    state.affiliateCommissionType === "PERCENT" ? "20" : "5.00"
                  }
                />
              )}
            </div>
          </Field>

          {canSetCommission && (
            <Field
              label="Per-course commission override (bps)"
              hint="Admin-only. Leave blank to use the category default (set in /admin/courses/settings). 100 bps = 1%. Example: 2000 = 20% platform fee / 80% tutor."
            >
              <input
                type="number"
                min={0}
                max={10000}
                step={10}
                value={state.commissionRateBps ?? ""}
                onChange={(e) =>
                  update(
                    "commissionRateBps",
                    e.target.value === "" ? null : parseInt(e.target.value, 10)
                  )
                }
                className={inputCls + " tabular-nums"}
                placeholder="—"
              />
            </Field>
          )}

          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-100/90">
              Payment is taken from the student&apos;s wallet balance at checkout.
              Tutors are credited automatically based on the commission split
              once an enrolment completes.
            </p>
          </div>
        </>
      )}

      <div className="border-t border-slate-800 pt-4 space-y-3">
        <Field label="Course visibility">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="inline-flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={state.certificateEnabled}
                onChange={(e) =>
                  update("certificateEnabled", e.target.checked)
                }
              />
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Issue a certificate on completion
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={state.nsfw}
                onChange={(e) => update("nsfw", e.target.checked)}
              />
              Mark as NSFW (hidden from default browse)
            </label>
          </div>
        </Field>
      </div>
    </div>
  );
}
