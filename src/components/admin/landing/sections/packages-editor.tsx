"use client";

import type { PackagesContent } from "@/lib/landing-content";
import {
  Field,
  GradientPicker,
  IconKeyPicker,
  RepeatingList,
  SectionCard,
  StringListEditor,
  inp,
  inpSm,
} from "../_shared";

interface Props {
  value: PackagesContent;
  onChange: (next: PackagesContent) => void;
  disabled?: boolean;
}

export function PackagesEditor({ value, onChange, disabled }: Props) {
  const set = <K extends keyof PackagesContent>(
    k: K,
    v: PackagesContent[K]
  ) => onChange({ ...value, [k]: v });

  return (
    <div className="space-y-4">
      <SectionCard title="Header">
        <Field label="Badge">
          <input
            value={value.badge}
            onChange={(e) => set("badge", e.target.value)}
            disabled={disabled}
            className={inp}
          />
        </Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Heading Line 1">
            <input
              value={value.heading_line1}
              onChange={(e) => set("heading_line1", e.target.value)}
              disabled={disabled}
              className={inp}
            />
          </Field>
          <Field label="Heading Line 2 (gradient)">
            <input
              value={value.heading_line2}
              onChange={(e) => set("heading_line2", e.target.value)}
              disabled={disabled}
              className={inp}
            />
          </Field>
        </div>
        <Field label="Subheading">
          <textarea
            rows={2}
            value={value.subheading}
            onChange={(e) => set("subheading", e.target.value)}
            disabled={disabled}
            className={inp + " resize-none"}
          />
        </Field>
        <Field label="Money-Back Guarantee Text">
          <textarea
            rows={2}
            value={value.guarantee_text}
            onChange={(e) => set("guarantee_text", e.target.value)}
            disabled={disabled}
            className={inp + " resize-none"}
          />
        </Field>
      </SectionCard>

      <SectionCard title="Plans">
        {/* The home page shows the LIVE plans from Plan Management whenever
            any exist; these hand-typed plans are only the fallback. */}
        <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          The home page now shows your real plans from{" "}
          <a href="/admin/packages" className="font-semibold underline">Plan Management</a> — prices, selling
          points, &ldquo;Most popular&rdquo; and the comparison table all come from there. The plans below are
          only used if no plan is live.
        </p>
        <RepeatingList
          items={value.plans}
          onChange={(next) => set("plans", next)}
          newItem={() => ({
            iconKey: "Star",
            name: "New Plan",
            price: "$0",
            period: "/month",
            description: "",
            features: [],
            cta_label: "Get Started",
            is_popular: false,
            gradient: "from-indigo-500 to-indigo-600",
          })}
          addLabel="+ Add Plan"
          disabled={disabled}
          minItems={1}
          itemTitle={(it) => it.name || "(unnamed)"}
          render={(item, update) => (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Icon">
                  <IconKeyPicker
                    value={item.iconKey}
                    onChange={(v) => update({ iconKey: v })}
                    group="package"
                    disabled={disabled}
                  />
                </Field>
                <Field label="Gradient">
                  <GradientPicker
                    value={item.gradient}
                    onChange={(v) => update({ gradient: v })}
                    disabled={disabled}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Name">
                  <input
                    value={item.name}
                    onChange={(e) => update({ name: e.target.value })}
                    disabled={disabled}
                    className={inpSm}
                  />
                </Field>
                <Field label="Description">
                  <input
                    value={item.description}
                    onChange={(e) => update({ description: e.target.value })}
                    disabled={disabled}
                    className={inpSm}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Price">
                  <input
                    value={item.price}
                    onChange={(e) => update({ price: e.target.value })}
                    disabled={disabled}
                    className={inpSm}
                  />
                </Field>
                <Field label="Period">
                  <input
                    value={item.period}
                    onChange={(e) => update({ period: e.target.value })}
                    disabled={disabled}
                    className={inpSm}
                    placeholder="/month"
                  />
                </Field>
                <Field label="CTA Label">
                  <input
                    value={item.cta_label}
                    onChange={(e) => update({ cta_label: e.target.value })}
                    disabled={disabled}
                    className={inpSm}
                  />
                </Field>
              </div>
              <Field label="Feature List">
                <StringListEditor
                  items={item.features}
                  onChange={(next) => update({ features: next })}
                  disabled={disabled}
                  placeholder="One feature per line"
                />
              </Field>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-300">
                <input
                  type="checkbox"
                  checked={item.is_popular}
                  onChange={(e) => update({ is_popular: e.target.checked })}
                  disabled={disabled}
                  className="rounded bg-slate-800 border-slate-700"
                />
                Mark as &quot;Most Popular&quot;
              </label>
            </div>
          )}
        />
      </SectionCard>
    </div>
  );
}
