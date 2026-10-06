"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { toast } from "@/lib/toast";
import { Toggle } from "@/components/admin/shared/controls";

/**
 * "Which emails are sent" — one switch per automatic email
 * (src/lib/email-categories.ts). Locked rows (verification, password reset,
 * admin sends) are shown so the admin can see they always go, but cannot be
 * switched off. Saved on its own, not with the rest of the settings form.
 */

type Category = {
  key: string;
  label: string;
  description: string;
  group: "always" | "account" | "activity" | "staff";
  locked: boolean;
  on: boolean;
};

type Payload = { canEdit: boolean; groups: Record<Category["group"], string>; categories: Category[] };

const GROUP_ORDER: Category["group"][] = ["always", "account", "activity", "staff"];

export function EmailCategoriesPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/settings/email-categories", { cache: "no-store" });
      if (!r.ok) throw new Error();
      const d = (await r.json()) as Payload;
      setData(d);
      setDraft(Object.fromEntries(d.categories.map((c) => [c.key, c.on])));
    } catch {
      toast.error("Couldn't load the email switches.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(
    () => !!data && data.categories.some((c) => !c.locked && draft[c.key] !== c.on),
    [data, draft]
  );

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/settings/email-categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!r.ok) throw new Error();
      toast.success("Email switches saved.");
      await load();
    } catch {
      toast.error("Couldn't save the email switches.");
    } finally {
      setSaving(false);
    }
  };

  if (!data) return <Loader2 className="h-4 w-4 animate-spin text-slate-500" />;

  const switchable = data.categories.filter((c) => !c.locked);
  const allOff = () => setDraft((d) => ({ ...d, ...Object.fromEntries(switchable.map((c) => [c.key, false])) }));

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-slate-400">
        Only the switched-on emails are sent. Turning one off stops the <strong>email copy</strong> only — users
        still get the in-app notification (and push). Verification codes, password resets and anything you send by
        hand always go.
      </p>

      {GROUP_ORDER.map((g) => {
        const rows = data.categories.filter((c) => c.group === g);
        if (rows.length === 0) return null;
        return (
          <div key={g} className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{data.groups[g]}</p>
            {rows.map((c) =>
              c.locked ? (
                <div
                  key={c.key}
                  className="flex items-start justify-between gap-3 rounded-lg border border-slate-800/70 bg-slate-950/40 p-3"
                >
                  <div>
                    <p className="text-sm text-white">{c.label}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{c.description}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                    <Lock className="h-3 w-3" />
                    Always on
                  </span>
                </div>
              ) : (
                <Toggle
                  key={c.key}
                  label={c.label}
                  description={c.description}
                  checked={!!draft[c.key]}
                  onChange={(v) => setDraft((d) => ({ ...d, [c.key]: v }))}
                  disabled={!data.canEdit || saving}
                  tone="emerald"
                />
              )
            )}
          </div>
        );
      })}

      {data.canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save email switches
          </button>
          <button
            type="button"
            onClick={allOff}
            disabled={saving}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            Turn all automatic emails off
          </button>
          {dirty && <span className="text-xs text-amber-300">Unsaved changes</span>}
        </div>
      ) : (
        <p className="text-xs text-slate-500">Read-only — changing these needs the settings.edit permission.</p>
      )}
    </div>
  );
}
