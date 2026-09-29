"use client";

import type { FooterContent } from "@/lib/landing-content";
import {
  Field,
  RepeatingList,
  SectionCard,
  StringListEditor,
  inp,
  inpSm,
} from "../_shared";

interface Props {
  value: FooterContent;
  onChange: (next: FooterContent) => void;
  disabled?: boolean;
}

export function FooterEditor({ value, onChange, disabled }: Props) {
  const set = <K extends keyof FooterContent>(k: K, v: FooterContent[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div className="space-y-4">
      <SectionCard title="Brand">
        <Field label="Brand Description">
          <textarea
            rows={3}
            value={value.brand_description}
            onChange={(e) => set("brand_description", e.target.value)}
            disabled={disabled}
            className={inp + " resize-none"}
          />
        </Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Copyright Notice" hint="Use {year} for the current year.">
            <input
              value={value.copyright_notice}
              onChange={(e) => set("copyright_notice", e.target.value)}
              disabled={disabled}
              className={inp}
            />
          </Field>
          <Field label="Tagline">
            <input
              value={value.tagline}
              onChange={(e) => set("tagline", e.target.value)}
              disabled={disabled}
              className={inp}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Payment Methods">
        <Field label="Section Label">
          <input
            value={value.payment_methods_label}
            onChange={(e) => set("payment_methods_label", e.target.value)}
            disabled={disabled}
            className={inp}
          />
        </Field>
        <Field label="Methods">
          <StringListEditor
            items={value.payment_methods}
            onChange={(next) => set("payment_methods", next)}
            disabled={disabled}
            placeholder="PayPal, Binance, …"
          />
        </Field>
      </SectionCard>

      <SectionCard title="Link Groups">
        <RepeatingList
          items={value.link_groups}
          onChange={(next) => set("link_groups", next)}
          newItem={() => ({ title: "New Group", links: [] })}
          addLabel="+ Add Group"
          disabled={disabled}
          itemTitle={(it) => it.title || "(empty)"}
          render={(group, update) => (
            <div className="space-y-2">
              <Field label="Group Title">
                <input
                  value={group.title}
                  onChange={(e) => update({ title: e.target.value })}
                  disabled={disabled}
                  className={inpSm}
                />
              </Field>
              <Field label="Links">
                <RepeatingList
                  items={group.links}
                  onChange={(next) => update({ links: next })}
                  newItem={() => ({ label: "", href: "" })}
                  addLabel="+ Add Link"
                  disabled={disabled}
                  itemTitle={(it) => it.label || "(empty)"}
                  render={(link, updateLink) => (
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={link.label}
                        onChange={(e) =>
                          updateLink({ label: e.target.value })
                        }
                        disabled={disabled}
                        className={inpSm}
                        placeholder="Label"
                      />
                      <input
                        value={link.href}
                        onChange={(e) =>
                          updateLink({ href: e.target.value })
                        }
                        disabled={disabled}
                        className={inpSm}
                        placeholder="/path or #anchor"
                      />
                    </div>
                  )}
                />
              </Field>
            </div>
          )}
        />
      </SectionCard>
    </div>
  );
}
