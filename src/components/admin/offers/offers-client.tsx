"use client";

import { confirmDialog } from "@/lib/confirm";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Loader2,
  Edit,
  Trash2,
  ExternalLink,
  Copy,
  Gift,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface OfferRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  updatedAt: string;
}

export function OffersClient({
  initial,
  canManage,
}: {
  initial: OfferRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [offers, setOffers] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const create = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/admin/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled offer" }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      router.push(`/admin/offers/${d.offer.id}`);
    } catch (err) {
      toast.error("Couldn't create offer", {
        description: err instanceof Error ? err.message : "Try again",
      });
      setCreating(false);
    }
  };

  const remove = async (o: OfferRow) => {
    if (!(await confirmDialog({ title: `Delete offer "${o.title}"?`, description: "This can't be undone.", tone: "danger", confirmLabel: "Delete" }))) return;
    setDeletingId(o.id);
    try {
      const res = await fetch(`/api/admin/offers/${o.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setOffers((prev) => prev.filter((x) => x.id !== o.id));
      toast.success("Offer deleted");
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/offer/${slug}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success("Public link copied"),
      () => toast.error("Couldn't copy")
    );
  };

  return (
    <>
      {canManage && (
        <div className="flex justify-end">
          <button
            onClick={create}
            disabled={creating}
            className="inline-flex items-center gap-2 px-4 py-2 bg-fuchsia-600 text-white rounded-lg hover:bg-fuchsia-700 disabled:opacity-50"
          >
            {creating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            New Offer
          </button>
        </div>
      )}

      {offers.length === 0 ? (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-16 text-center">
          <Gift className="w-12 h-12 mx-auto mb-4 text-slate-600" />
          <h3 className="text-lg font-medium text-white mb-1">No offers yet</h3>
          <p className="text-sm text-slate-400">
            Create a custom marketing page and share its public link.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900 divide-y divide-slate-800">
          {offers.map((o) => (
            <div key={o.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white truncate">
                    {o.title}
                  </p>
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold",
                      o.status === "PUBLISHED"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-slate-700 text-slate-300"
                    )}
                  >
                    {o.status}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">
                  /offer/{o.slug}
                </p>
              </div>

              <button
                onClick={() => copyLink(o.slug)}
                className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800"
                title="Copy public link"
              >
                <Copy className="w-4 h-4" />
              </button>
              <Link
                href={`/offer/${o.slug}?preview=1`}
                target="_blank"
                className="p-1.5 rounded text-slate-400 hover:text-indigo-400 hover:bg-slate-800"
                title="Open"
              >
                <ExternalLink className="w-4 h-4" />
              </Link>
              {canManage && (
                <>
                  <Link
                    href={`/admin/offers/${o.id}`}
                    className="p-1.5 rounded text-slate-400 hover:text-blue-400 hover:bg-slate-800"
                    title="Edit"
                  >
                    <Edit className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={() => remove(o)}
                    disabled={deletingId === o.id}
                    className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-800 disabled:opacity-50"
                    title="Delete"
                  >
                    {deletingId === o.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
