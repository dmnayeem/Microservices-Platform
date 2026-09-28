"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Eye, Download, FileText } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { mediaSrc } from "@/lib/media-url";

export interface BlogListRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  publishedAt: string | Date | null;
  updatedAt: string | Date;
  views: number;
  category: string | null;
  focusKeyword: string | null;
  coverImage: string | null;
}

function state(p: BlogListRow): { label: string; tone: string } {
  if (p.status !== "PUBLISHED") return { label: "Draft", tone: "bg-slate-700 text-slate-300" };
  if (p.publishedAt && new Date(p.publishedAt).getTime() > Date.now()) return { label: "Scheduled", tone: "bg-sky-500/15 text-sky-300" };
  return { label: "Published", tone: "bg-emerald-500/15 text-emerald-300" };
}

export function BlogList({ rows, canEdit, builtInsMissing }: { rows: BlogListRow[]; canEdit: boolean; builtInsMissing: number }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const shown = rows.filter((r) => !q || r.title.toLowerCase().includes(q.toLowerCase()));

  const importBuiltIns = async () => {
    setBusy(true);
    const r = await fetch("/api/admin/blog/import", { method: "POST" });
    setBusy(false);
    if (!r.ok) return toast.error("Import failed");
    const d = await r.json();
    toast.success(`Imported ${d.imported} article(s)`);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {canEdit && (
          <Link href="/admin/blog/new" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">
            <Plus className="h-4 w-4" /> New article
          </Link>
        )}
        {canEdit && builtInsMissing > 0 && (
          <button type="button" disabled={busy} onClick={importBuiltIns} className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50">
            <Download className="h-4 w-4" /> Import {builtInsMissing} built-in article{builtInsMissing === 1 ? "" : "s"} to edit
          </button>
        )}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search articles" className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none" />
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center text-sm text-slate-400">
          <FileText className="mx-auto mb-2 h-8 w-8 text-slate-600" />
          {rows.length === 0 ? "No articles yet. Write the first one." : "No article matches that search."}
        </div>
      ) : (
        <div className="divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-700 bg-slate-900/60">
          {shown.map((p) => {
            const st = state(p);
            return (
              <Link key={p.id} href={`/admin/blog/${p.id}`} className="flex items-center gap-3 p-3 hover:bg-slate-800/60">
                {p.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaSrc(p.coverImage)} alt="" className="h-14 w-20 shrink-0 rounded-lg object-cover bg-black" />
                ) : (
                  <div className="grid h-14 w-20 shrink-0 place-items-center rounded-lg bg-slate-800 text-xl">📝</div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white line-clamp-1">{p.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", st.tone)}>{st.label}</span>
                    {p.category && <span>{p.category}</span>}
                    <span>Updated {new Date(p.updatedAt).toLocaleDateString()}</span>
                    {p.focusKeyword ? <span className="text-slate-500">🔑 {p.focusKeyword}</span> : <span className="text-amber-400/80">No focus keyword</span>}
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-slate-400">
                  <Eye className="h-3.5 w-3.5" /> {p.views.toLocaleString()}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
