"use client";

import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Store, Power, Trash2, ExternalLink, Pencil, X } from "lucide-react";
import { toast } from "@/lib/toast";

export type BrandRow = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  bio: string | null;
  website: string | null;
  isActive: boolean;
  listingCount: number;
};

type Draft = { name: string; logo: string; bio: string; website: string };

const EMPTY: Draft = { name: "", logo: "", bio: "", website: "" };

export function BrandsClient({ initial }: { initial: BrandRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);

  const post = async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
    return json;
  };

  const create = async () => {
    if (draft.name.trim().length < 2) {
      toast.error("Give the storefront a name");
      return;
    }
    setBusy("new");
    try {
      await post("/api/admin/marketplace/brands", "POST", {
        name: draft.name.trim(),
        logo: draft.logo.trim() || null,
        bio: draft.bio.trim() || null,
        website: draft.website.trim() || null,
      });
      toast.success(`"${draft.name.trim()}" created`);
      setDraft(EMPTY);
      setCreating(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the storefront");
    } finally {
      setBusy(null);
    }
  };

  const saveEdit = async (id: string) => {
    setBusy(id);
    try {
      await post(`/api/admin/marketplace/brands/${id}`, "PATCH", {
        name: draft.name.trim(),
        logo: draft.logo.trim() || null,
        bio: draft.bio.trim() || null,
        website: draft.website.trim() || null,
      });
      toast.success("Saved");
      setEditingId(null);
      setDraft(EMPTY);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (b: BrandRow) => {
    setBusy(b.id);
    try {
      await post(`/api/admin/marketplace/brands/${b.id}`, "PATCH", { isActive: !b.isActive });
      toast.success(b.isActive ? `"${b.name}" deactivated` : `"${b.name}" is live again`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (b: BrandRow) => {
    setBusy(b.id);
    try {
      const res = await post(`/api/admin/marketplace/brands/${b.id}`, "DELETE");
      // A brand with listings is deactivated instead of deleted — say which
      // happened rather than reporting a delete that did not occur.
      toast.success(res.message ?? `"${b.name}" deleted`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setBusy(null);
    }
  };

  const startEdit = (b: BrandRow) => {
    setEditingId(b.id);
    setCreating(false);
    setDraft({ name: b.name, logo: b.logo ?? "", bio: b.bio ?? "", website: b.website ?? "" });
  };

  const fields = (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">
        <span className="text-gray-400">Name</span>
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Nova Stock Studio"
          className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
        />
      </label>
      <label className="text-sm">
        <span className="text-gray-400">Website (optional)</span>
        <input
          value={draft.website}
          onChange={(e) => setDraft({ ...draft, website: e.target.value })}
          placeholder="https://example.com"
          className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
        />
      </label>
      <div className="text-sm sm:col-span-2">
        <span className="text-gray-400">Logo (optional)</span>
        {/* Upload or pick from the media library — it was a bare URL box. */}
        <div className="mt-1">
          <ImageUploadField
            value={draft.logo ?? ""}
            onChange={(url) => setDraft({ ...draft, logo: url })}
            title="Brand logo"
            previewSize="square"
            urlPlaceholder="…or paste a logo URL"
          />
        </div>
      </div>
      <label className="text-sm sm:col-span-2">
        <span className="text-gray-400">Short bio (optional)</span>
        <textarea
          value={draft.bio}
          onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
          rows={2}
          placeholder="Shown on the storefront page."
          className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
        />
      </label>
    </div>
  );

  return (
    <div className="space-y-4">
      {!creating && editingId === null && (
        <button
          onClick={() => {
            setCreating(true);
            setDraft(EMPTY);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          New storefront
        </button>
      )}

      {creating && (
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-medium">New storefront</h2>
            <button onClick={() => setCreating(false)} className="text-gray-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          {fields}
          <button
            onClick={create}
            disabled={busy === "new"}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 rounded-lg text-white text-sm font-medium"
          >
            {busy === "new" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create
          </button>
        </div>
      )}

      {initial.length === 0 && !creating && (
        <p className="text-gray-400 text-sm">
          No storefronts yet. Listings you publish without one show your admin account as
          the seller.
        </p>
      )}

      <div className="space-y-3">
        {initial.map((b) => (
          <div
            key={b.id}
            className={`bg-gray-800/60 border rounded-xl p-4 ${
              b.isActive ? "border-gray-700" : "border-gray-800 opacity-70"
            }`}
          >
            {editingId === b.id ? (
              <div className="space-y-3">
                {fields}
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(b.id)}
                    disabled={busy === b.id}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 rounded-lg text-white text-sm"
                  >
                    {busy === b.id && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-gray-900 border border-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
                    {b.logo ? (
                      // Storefront logos are arbitrary external URLs, so this
                      // stays a plain <img> rather than next/image.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.logo} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Store className="w-5 h-5 text-gray-500" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium">{b.name}</span>
                      {!b.isActive && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-gray-700 text-gray-300">
                          Inactive
                        </span>
                      )}
                      <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300">
                        {b.listingCount} listing{b.listingCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="text-gray-500 text-xs mt-0.5">/marketplace/brand/{b.slug}</p>
                    {b.bio && <p className="text-gray-400 text-sm mt-1 line-clamp-2">{b.bio}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {b.website && (
                    <a
                      href={b.website}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="p-2 rounded-lg hover:bg-gray-700 text-gray-400"
                      title="Open website"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    onClick={() => startEdit(b)}
                    className="p-2 rounded-lg hover:bg-gray-700 text-gray-400"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggle(b)}
                    disabled={busy === b.id}
                    className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 disabled:opacity-50"
                    title={b.isActive ? "Deactivate" : "Reactivate"}
                  >
                    {busy === b.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Power className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => remove(b)}
                    disabled={busy === b.id}
                    className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 disabled:opacity-50"
                    title={
                      b.listingCount > 0
                        ? "Has listings — will be deactivated, not deleted"
                        : "Delete"
                    }
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
