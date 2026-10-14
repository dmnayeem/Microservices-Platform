"use client";

import { useState } from "react";
import { NumberInput } from "@/components/admin/number-input";
import {
  Plus,
  X,
  ArrowUp,
  ArrowDown,
  Type,
  AlignLeft,
  Link as LinkIcon,
  Mail,
  Phone,
  Hash,
  Image as ImageIcon,
  Images,
  Paperclip,
  Video as VideoIcon,
  ChevronDown,
  CheckSquare,
  Settings as SettingsIcon,
  AlertCircle,
} from "lucide-react";
import {
  type CustomConfig,
  type CustomField,
  type CustomFieldType,
  FIELD_TYPE_LABEL,
} from "@/lib/custom-tasks";

interface Props {
  value: CustomConfig;
  onChange: (next: CustomConfig) => void;
}

const ALL_TYPES: CustomFieldType[] = [
  "TEXT",
  "TEXTAREA",
  "LINK",
  "EMAIL",
  "PHONE",
  "NUMBER",
  "IMAGE",
  "IMAGES",
  "FILE",
  "VIDEO",
  "SELECT",
  "CHECKBOX_GROUP",
];

const TYPE_ICON: Record<CustomFieldType, typeof Type> = {
  TEXT: Type,
  TEXTAREA: AlignLeft,
  LINK: LinkIcon,
  EMAIL: Mail,
  PHONE: Phone,
  NUMBER: Hash,
  IMAGE: ImageIcon,
  IMAGES: Images,
  FILE: Paperclip,
  VIDEO: VideoIcon,
  SELECT: ChevronDown,
  CHECKBOX_GROUP: CheckSquare,
};

const TYPE_TONE: Record<CustomFieldType, string> = {
  TEXT: "text-sky-400 bg-sky-500/10 border-sky-500/30",
  TEXTAREA: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  LINK: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  EMAIL: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30",
  PHONE: "text-violet-400 bg-violet-500/10 border-violet-500/30",
  NUMBER: "text-purple-400 bg-purple-500/10 border-purple-500/30",
  IMAGE: "text-pink-400 bg-pink-500/10 border-pink-500/30",
  IMAGES: "text-rose-400 bg-rose-500/10 border-rose-500/30",
  FILE: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  VIDEO: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  SELECT: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  CHECKBOX_GROUP: "text-teal-400 bg-teal-500/10 border-teal-500/30",
};

function genId() {
  return `f_${Math.random().toString(36).slice(2, 10)}`;
}

function emptyField(type: CustomFieldType, order: number): CustomField {
  const base: CustomField = {
    id: genId(),
    order,
    type,
    label: defaultLabel(type),
    required: true,
  };
  if (type === "SELECT" || type === "CHECKBOX_GROUP") {
    base.options = ["Option 1", "Option 2"];
  }
  if (type === "IMAGES") {
    base.maxImages = 5;
  }
  if (type === "TEXT") {
    base.maxLength = 200;
  }
  if (type === "TEXTAREA") {
    base.maxLength = 1000;
  }
  if (type === "IMAGE" || type === "IMAGES") {
    base.accept = "image/jpeg,image/jpg,image/png,image/webp,image/gif";
    base.maxSizeMb = 8;
  }
  if (type === "VIDEO") {
    base.accept = "video/mp4,video/webm,video/quicktime";
    base.maxSizeMb = 100;
  }
  return base;
}

function defaultLabel(type: CustomFieldType): string {
  switch (type) {
    case "TEXT":
      return "Short answer";
    case "TEXTAREA":
      return "Describe in detail";
    case "LINK":
      return "Paste a link";
    case "EMAIL":
      return "Email address";
    case "PHONE":
      return "Phone number";
    case "NUMBER":
      return "Enter a number";
    case "IMAGE":
      return "Upload an image";
    case "IMAGES":
      return "Upload images";
    case "FILE":
      return "Upload a file";
    case "VIDEO":
      return "Upload a video";
    case "SELECT":
      return "Pick one";
    case "CHECKBOX_GROUP":
      return "Pick all that apply";
  }
}

export function CustomTaskBuilder({ value, onChange }: Props) {
  const [showAdvanced, setShowAdvanced] = useState<Set<string>>(new Set());

  const fields = value.fields ?? [];

  const addField = (type: CustomFieldType) => {
    const next = [...fields, emptyField(type, fields.length)];
    onChange({ ...value, fields: next });
  };

  const updateField = (id: string, patch: Partial<CustomField>) => {
    onChange({
      ...value,
      fields: fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    });
  };

  const removeField = (id: string) => {
    onChange({
      ...value,
      fields: fields
        .filter((f) => f.id !== id)
        .map((f, i) => ({ ...f, order: i })),
    });
  };

  const moveField = (id: string, dir: -1 | 1) => {
    const idx = fields.findIndex((f) => f.id === id);
    if (idx === -1) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= fields.length) return;
    const next = [...fields];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onChange({
      ...value,
      fields: next.map((f, i) => ({ ...f, order: i })),
    });
  };

  const toggleAdvanced = (id: string) =>
    setShowAdvanced((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-5">
      {/* Intro & thank-you */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Intro message <span className="text-slate-600 font-normal">(optional)</span>
          </label>
          <textarea
            rows={2}
            value={value.introMessage ?? ""}
            onChange={(e) => onChange({ ...value, introMessage: e.target.value })}
            placeholder="Shown above the form. e.g. 'I need 5 photos of stationery shops near you.'"
            className={inp}
          />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Thank-you message <span className="text-slate-600 font-normal">(optional)</span>
          </label>
          <textarea
            rows={2}
            value={value.thankYouMessage ?? ""}
            onChange={(e) =>
              onChange({ ...value, thankYouMessage: e.target.value })
            }
            placeholder="Shown after submission. e.g. 'Thanks! We'll review and approve within 24h.'"
            className={inp}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer text-sm text-white">
        <input
          type="checkbox"
          checked={!!value.autoApprove}
          onChange={(e) =>
            onChange({ ...value, autoApprove: e.target.checked })
          }
          className="rounded bg-slate-800 border-slate-600 text-emerald-500"
        />
        Auto-approve submissions
        <span className="text-xs text-slate-500 font-normal">
          (off by default — admin reviews each one)
        </span>
      </label>

      {/* Field list */}
      <div className="space-y-2">
        {fields.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950 p-6 text-center">
            <SettingsIcon className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-400 font-semibold">
              Build the form users will fill in
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Add fields below — text, image, link, video, file, dropdown — anything you need.
            </p>
          </div>
        )}

        {fields.map((f, idx) => {
          const Icon = TYPE_ICON[f.type];
          const tone = TYPE_TONE[f.type];
          const adv = showAdvanced.has(f.id);
          return (
            <div
              key={f.id}
              className="rounded-xl border border-slate-700 bg-slate-950 p-4 space-y-3"
            >
              <div className="flex items-start gap-3">
                <span className="flex flex-col items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => moveField(f.id, -1)}
                    disabled={idx === 0}
                    className="p-1 rounded text-slate-500 hover:text-white hover:bg-slate-800 disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] font-bold text-slate-600 tabular-nums">
                    #{idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => moveField(f.id, 1)}
                    disabled={idx === fields.length - 1}
                    className="p-1 rounded text-slate-500 hover:text-white hover:bg-slate-800 disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </span>

                <div
                  className={`shrink-0 w-10 h-10 rounded-lg border flex items-center justify-center ${tone}`}
                >
                  <Icon className="w-5 h-5" />
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  <input
                    value={f.label}
                    onChange={(e) =>
                      updateField(f.id, { label: e.target.value })
                    }
                    placeholder="Field label / question"
                    className={`${inp} font-semibold`}
                  />
                  <div className="flex items-center gap-3 flex-wrap">
                    <select
                      value={f.type}
                      onChange={(e) =>
                        updateField(f.id, {
                          type: e.target.value as CustomFieldType,
                        })
                      }
                      className="px-2 py-1.5 text-xs rounded bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                    >
                      {ALL_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {FIELD_TYPE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                    <label className="text-xs text-slate-300 inline-flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={f.required}
                        onChange={(e) =>
                          updateField(f.id, { required: e.target.checked })
                        }
                        className="rounded bg-slate-800 border-slate-600 text-blue-500"
                      />
                      Required
                    </label>
                    <button
                      type="button"
                      onClick={() => toggleAdvanced(f.id)}
                      className="text-[11px] text-slate-400 hover:text-white inline-flex items-center gap-1"
                    >
                      <SettingsIcon className="w-3 h-3" />
                      {adv ? "Hide options" : "Options"}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => removeField(f.id)}
                  className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg shrink-0"
                  title="Remove field"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Hint */}
              <input
                value={f.hint ?? ""}
                onChange={(e) =>
                  updateField(f.id, { hint: e.target.value || undefined })
                }
                placeholder="Hint shown below the field (optional)"
                className={`${inp} text-xs`}
              />

              {/* Options for SELECT / CHECKBOX_GROUP */}
              {(f.type === "SELECT" || f.type === "CHECKBOX_GROUP") && (
                <OptionsEditor
                  options={f.options ?? []}
                  onChange={(opts) => updateField(f.id, { options: opts })}
                />
              )}

              {/* Advanced */}
              {adv && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-800">
                  {(f.type === "TEXT" || f.type === "TEXTAREA") && (
                    <Field label="Max length (chars)">
                      <NumberInput
                        min={1}
                        max={5000}
                        value={f.maxLength ?? ""}
                        onChange={(e) =>
                          updateField(f.id, {
                            maxLength: parseInt(e.target.value) || undefined,
                          })
                        }
                        className={inp}
                      />
                    </Field>
                  )}

                  {f.type === "NUMBER" && (
                    <>
                      <Field label="Min">
                        <NumberInput
                          value={f.min ?? ""}
                          onChange={(e) =>
                            updateField(f.id, {
                              min: e.target.value === ""
                                ? undefined
                                : Number(e.target.value),
                            })
                          }
                          className={inp}
                        />
                      </Field>
                      <Field label="Max">
                        <NumberInput
                          value={f.max ?? ""}
                          onChange={(e) =>
                            updateField(f.id, {
                              max: e.target.value === ""
                                ? undefined
                                : Number(e.target.value),
                            })
                          }
                          className={inp}
                        />
                      </Field>
                    </>
                  )}

                  {(f.type === "IMAGE" ||
                    f.type === "IMAGES" ||
                    f.type === "FILE" ||
                    f.type === "VIDEO") && (
                    <>
                      <Field label="Max file size (MB)">
                        <NumberInput
                          min={1}
                          max={100}
                          value={f.maxSizeMb ?? ""}
                          onChange={(e) =>
                            updateField(f.id, {
                              maxSizeMb: parseInt(e.target.value) || undefined,
                            })
                          }
                          className={inp}
                        />
                      </Field>
                      <Field label="Accepted types (mime, comma-separated)">
                        <input
                          value={f.accept ?? ""}
                          onChange={(e) =>
                            updateField(f.id, {
                              accept: e.target.value || undefined,
                            })
                          }
                          placeholder="image/jpeg,image/png"
                          className={`${inp} font-mono text-xs`}
                        />
                      </Field>
                    </>
                  )}

                  {f.type === "IMAGES" && (
                    <Field label="Max images">
                      <NumberInput
                        min={1}
                        max={20}
                        value={f.maxImages ?? 5}
                        onChange={(e) =>
                          updateField(f.id, {
                            maxImages: parseInt(e.target.value) || 1,
                          })
                        }
                        className={inp}
                      />
                    </Field>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add field type buttons */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 inline-flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Add a field
        </p>
        <div className="flex flex-wrap gap-2">
          {ALL_TYPES.map((t) => {
            const Icon = TYPE_ICON[t];
            const tone = TYPE_TONE[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => addField(t)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${tone} hover:scale-[1.02] transition-transform`}
              >
                <Icon className="w-3.5 h-3.5" />
                {FIELD_TYPE_LABEL[t]}
              </button>
            );
          })}
        </div>
      </div>

      {fields.length > 0 && (
        <p className="text-[11px] text-slate-500 inline-flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3" />
          {fields.length} field{fields.length === 1 ? "" : "s"} configured.
          Users will fill them in order.
        </p>
      )}
    </div>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="space-y-1.5 pt-2 border-t border-slate-800">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        Options
      </p>
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500 w-6 text-center font-mono tabular-nums">
            {i + 1}.
          </span>
          <input
            value={opt}
            onChange={(e) => {
              const copy = [...options];
              copy[i] = e.target.value;
              onChange(copy);
            }}
            placeholder={`Option ${i + 1}`}
            className={`${inp} text-xs`}
          />
          <button
            type="button"
            onClick={() => onChange(options.filter((_, j) => j !== i))}
            disabled={options.length <= 1}
            className="p-1.5 text-red-400 hover:bg-red-500/10 rounded disabled:opacity-30"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...options, ""])}
        className="text-[11px] text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 pl-8"
      >
        <Plus className="w-3 h-3" />
        Add option
      </button>
    </div>
  );
}

const inp =
  "w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
