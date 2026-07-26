"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TAG_OPTIONS } from "./profile-view.constants";
import { Modal } from "./profile-ui";

export function TagModal({
  selected,
  onClose,
  onSave,
}: {
  selected: string[];
  onClose: () => void;
  onSave: (tags: string[]) => Promise<void>;
}) {
  const [picked, setPicked] = useState<string[]>(selected);
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= 3) {
        toast.error("Pick up to 3 tags");
        return prev;
      }
      return [...prev, id];
    });
  };
  return (
    <Modal onClose={busy ? undefined : onClose} title="Choose Profile Tags" subtitle="Pick up to 3">
      <div className="grid grid-cols-2 gap-2">
        {TAG_OPTIONS.map((t) => {
          const isOn = picked.includes(t.id);
          return (
            <button
              key={t.id}
              onClick={() => toggle(t.id)}
              className={cn(
                "flex items-center gap-2 p-3 rounded-lg border text-left",
                isOn
                  ? "border-indigo-500 bg-indigo-500/10"
                  : "border-gray-800 bg-gray-950 hover:border-gray-700"
              )}
            >
              <span className="text-lg">{t.emoji}</span>
              <span className="text-sm text-white flex-1">{t.label}</span>
              {isOn && <CheckCircle2 className="w-4 h-4 text-indigo-400" />}
            </button>
          );
        })}
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} disabled={busy} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
          Cancel
        </button>
        <button
          onClick={async () => {
            setBusy(true);
            await onSave(picked);
            setBusy(false);
          }}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold rounded-lg disabled:opacity-50"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Save
        </button>
      </div>
    </Modal>
  );
}
