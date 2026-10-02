"use client";

import type { HeroContent } from "@/lib/landing-content";
import {
  Field,
  IconKeyPicker,
  RepeatingList,
  SectionCard,
  inp,
  inpSm,
} from "../_shared";
import { HeroAnimationEditor } from "./hero-animation-editor";

interface Props {
  value: HeroContent;
  onChange: (next: HeroContent) => void;
  disabled?: boolean;
}

export function HeroEditor({ value, onChange, disabled }: Props) {
  const set = <K extends keyof HeroContent>(k: K, v: HeroContent[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div className="space-y-4">
      <SectionCard title="Headline">
        <Field label="Trust Badge">
          <input
            value={value.badge}
            onChange={(e) => set("badge", e.target.value)}
            disabled={disabled}
            className={inp}
          />
        </Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Title Line 1">
            <input
              value={value.title_line1}
              onChange={(e) => set("title_line1", e.target.value)}
              disabled={disabled}
              className={inp}
            />
          </Field>
          <Field label="Title Line 2 (gradient)">
            <input
              value={value.title_line2}
              onChange={(e) => set("title_line2", e.target.value)}
              disabled={disabled}
              className={inp}
            />
          </Field>
        </div>
        <Field label="Subtitle">
          <textarea
            rows={3}
            value={value.subtitle}
            onChange={(e) => set("subtitle", e.target.value)}
            disabled={disabled}
            className={inp + " resize-none"}
          />
        </Field>
      </SectionCard>

      <SectionCard title="Primary CTA">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Label">
            <input
              value={value.cta_primary_label}
              onChange={(e) => set("cta_primary_label", e.target.value)}
              disabled={disabled}
              className={inp}
            />
          </Field>
          <Field label="Href">
            <input
              value={value.cta_primary_href}
              onChange={(e) => set("cta_primary_href", e.target.value)}
              disabled={disabled}
              className={inp}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Secondary CTA">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Label">
            <input
              value={value.cta_secondary_label}
              onChange={(e) => set("cta_secondary_label", e.target.value)}
              disabled={disabled}
              className={inp}
            />
          </Field>
          <Field label="Href">
            <input
              value={value.cta_secondary_href}
              onChange={(e) => set("cta_secondary_href", e.target.value)}
              disabled={disabled}
              className={inp}
            />
          </Field>
        </div>
      </SectionCard>

      <HeroAnimationEditor
        value={value.animation}
        onChange={(next) => set("animation", next)}
        disabled={disabled}
      />

      <SectionCard
        title="Stat Cards"
        description="Up to 4 cards displayed under the hero CTAs."
      >
        <RepeatingList
          items={value.stats}
          onChange={(next) => set("stats", next)}
          newItem={() => ({ iconKey: "Star", value: "0", label: "New stat" })}
          addLabel="+ Add Stat"
          disabled={disabled}
          itemTitle={(it) => it.label || "(empty)"}
          render={(item, update) => (
            <div className="grid grid-cols-3 gap-2">
              <Field label="Icon">
                <IconKeyPicker
                  value={item.iconKey}
                  onChange={(v) => update({ iconKey: v })}
                  group="hero"
                  disabled={disabled}
                />
              </Field>
              <Field label="Value">
                <input
                  value={item.value}
                  onChange={(e) => update({ value: e.target.value })}
                  disabled={disabled}
                  className={inpSm}
                />
              </Field>
              <Field label="Label">
                <input
                  value={item.label}
                  onChange={(e) => update({ label: e.target.value })}
                  disabled={disabled}
                  className={inpSm}
                />
              </Field>
            </div>
          )}
        />
      </SectionCard>
    </div>
  );
}
