"use client";

import { Laptop, Smartphone } from "lucide-react";
import { DEVICE_BRANDS, DEVICE_OSES, DEVICE_TYPES } from "@/lib/device-info";
import type { DeviceTarget } from "@/lib/device-target";

/**
 * "Which devices" — phone / tablet / computer, Android / iPhone / Windows /
 * Mac…, and phone brands. Used on the task form, banners, popups and
 * notifications (lib/device-target.ts). Nothing ticked = every device.
 */
export function DeviceTargetPicker({
  value,
  onChange,
  disabled,
  note,
}: {
  value: DeviceTarget;
  onChange: (next: DeviceTarget) => void;
  disabled?: boolean;
  /** One line under the title, e.g. "Matches the device they are using now." */
  note?: string;
}) {
  const toggle = (field: keyof DeviceTarget, key: string) => {
    const cur = new Set(value[field]);
    if (cur.has(key)) cur.delete(key);
    else cur.add(key);
    onChange({ ...value, [field]: [...cur] });
  };
  const any = value.deviceTypes.length + value.deviceOses.length + value.deviceBrands.length === 0;

  const row = (title: string, field: keyof DeviceTarget, items: { key: string; label: string }[]) => (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => {
          const on = value[field].includes(it.key);
          return (
            <button
              key={it.key}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => toggle(field, it.key)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                on
                  ? "border-sky-500 bg-sky-500/15 text-sky-200"
                  : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white"
              }`}
            >
              {it.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-3 rounded-lg border border-gray-800 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-white">
          <Smartphone className="h-4 w-4 text-sky-400" />
          <Laptop className="h-4 w-4 text-sky-400" /> Devices
        </span>
        <span className="text-xs text-gray-500">{any ? "Every device" : "Only the ticked devices"}</span>
        {!any && !disabled && (
          <button
            type="button"
            onClick={() => onChange({ deviceTypes: [], deviceOses: [], deviceBrands: [] })}
            className="ml-auto text-xs text-sky-400 hover:underline"
          >
            Clear
          </button>
        )}
      </div>
      {note && <p className="-mt-1 text-[11px] text-gray-500">{note}</p>}
      {row("Type", "deviceTypes", DEVICE_TYPES)}
      {row("System", "deviceOses", DEVICE_OSES)}
      {row("Phone brand", "deviceBrands", DEVICE_BRANDS)}
      <p className="text-[11px] text-gray-500">
        Within a row, any ticked item matches. Across rows, all must match — e.g. Mobile + Android + Samsung = Samsung
        Android phones only. A phone whose brand can&apos;t be read counts as &ldquo;Other / unknown&rdquo;.
      </p>
    </div>
  );
}
