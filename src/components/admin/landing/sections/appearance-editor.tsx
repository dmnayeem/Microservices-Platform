"use client";

import { Sun, Moon, Sparkles } from "lucide-react";
import type { AppearanceContent } from "@/lib/landing-content";
import { Field, SectionCard } from "../_shared";

interface Props {
  value: AppearanceContent;
  onChange: (next: AppearanceContent) => void;
  disabled?: boolean;
}

export function AppearanceEditor({ value, onChange, disabled }: Props) {
  const set = <K extends keyof AppearanceContent>(
    k: K,
    v: AppearanceContent[K]
  ) => onChange({ ...value, [k]: v });

  const themes: Array<{ key: "light" | "dark"; label: string; icon: typeof Sun }> = [
    { key: "light", label: "Light", icon: Sun },
    { key: "dark", label: "Dark", icon: Moon },
  ];

  return (
    <SectionCard
      title="Appearance"
      description="Controls the landing/marketing pages only — not the in-app dashboard."
    >
      <Field
        label="Default theme"
        hint="What first-time visitors see. Visitors can switch with the toggle in the navbar; their choice is remembered."
      >
        <div className="grid grid-cols-2 gap-2 max-w-xs">
          {themes.map((t) => {
            const active = value.theme === t.key;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => set("theme", t.key)}
                disabled={disabled}
                aria-pressed={active}
                className={`inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-60 ${
                  active
                    ? "bg-blue-500/15 text-white border-blue-500/50"
                    : "bg-slate-950 text-slate-400 border-slate-700 hover:text-white hover:border-slate-500"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field
        label="Animations"
        hint="Animated background glow and subtle card hover-zoom on the landing pages."
      >
        <button
          type="button"
          onClick={() => set("animations", !value.animations)}
          disabled={disabled}
          role="switch"
          aria-checked={value.animations}
          className={`inline-flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-60 ${
            value.animations
              ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/40"
              : "bg-slate-950 text-slate-400 border-slate-700"
          }`}
        >
          <span
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              value.animations ? "bg-emerald-500" : "bg-slate-600"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                value.animations ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" />
            {value.animations ? "Animations on" : "Animations off"}
          </span>
        </button>
      </Field>
    </SectionCard>
  );
}
