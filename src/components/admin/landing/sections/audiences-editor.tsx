"use client";

import type { AudiencesContent } from "@/lib/landing-content";
import { Field, IconKeyPicker, RepeatingList, SectionCard, inp, inpSm } from "../_shared";

interface Props {
  value: AudiencesContent;
  onChange: (next: AudiencesContent) => void;
  disabled?: boolean;
}

/** "Who it's for" — one card per kind of visitor: who, what they do, what they get. */
export function AudiencesEditor({ value, onChange, disabled }: Props) {
  const set = <K extends keyof AudiencesContent>(k: K, v: AudiencesContent[K]) => onChange({ ...value, [k]: v });

  return (
    <div className="space-y-4">
      <SectionCard title="Header">
        <Field label="Badge">
          <input value={value.badge} onChange={(e) => set("badge", e.target.value)} disabled={disabled} className={inp} />
        </Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Heading Line 1">
            <input value={value.heading_line1} onChange={(e) => set("heading_line1", e.target.value)} disabled={disabled} className={inp} />
          </Field>
          <Field label="Heading Line 2 (gradient)">
            <input value={value.heading_line2} onChange={(e) => set("heading_line2", e.target.value)} disabled={disabled} className={inp} />
          </Field>
        </div>
        <Field label="Subheading">
          <textarea rows={2} value={value.subheading} onChange={(e) => set("subheading", e.target.value)} disabled={disabled} className={inp + " resize-none"} />
        </Field>
      </SectionCard>

      <SectionCard
        title="Cards"
        description="One card per kind of visitor. Keep it plain: who it is for, what they do (2–3 short steps), what they get."
      >
        <RepeatingList
          items={value.items}
          onChange={(next) => set("items", next)}
          newItem={() => ({
            iconKey: "Sparkles",
            title: "New card",
            who: "",
            does: ["", "", ""],
            gets: "",
            cta_label: "Learn more",
            cta_href: "/register",
          })}
          addLabel="+ Add card"
          disabled={disabled}
          itemTitle={(it) => it.title || "(untitled)"}
          render={(item, update) => (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Title">
                  <input value={item.title} onChange={(e) => update({ title: e.target.value })} disabled={disabled} className={inpSm} />
                </Field>
                <Field label="Icon">
                  <IconKeyPicker value={item.iconKey} onChange={(v) => update({ iconKey: v })} group="audience" disabled={disabled} />
                </Field>
              </div>
              <Field label="Who it is for (one line)">
                <input value={item.who} onChange={(e) => update({ who: e.target.value })} disabled={disabled} className={inpSm} />
              </Field>
              <Field label="What they do — one step per line">
                <textarea
                  rows={3}
                  value={item.does.join("\n")}
                  onChange={(e) => update({ does: e.target.value.split("\n").slice(0, 5) })}
                  disabled={disabled}
                  className={inpSm + " resize-none"}
                />
              </Field>
              <Field label="What they get (one line)">
                <input value={item.gets} onChange={(e) => update({ gets: e.target.value })} disabled={disabled} className={inpSm} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Button text">
                  <input value={item.cta_label} onChange={(e) => update({ cta_label: e.target.value })} disabled={disabled} className={inpSm} />
                </Field>
                <Field label="Button link">
                  <input value={item.cta_href} onChange={(e) => update({ cta_href: e.target.value })} disabled={disabled} className={inpSm} placeholder="/microtask" />
                </Field>
              </div>
            </div>
          )}
        />
      </SectionCard>
    </div>
  );
}
