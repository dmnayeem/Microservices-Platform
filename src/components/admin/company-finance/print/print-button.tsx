"use client";

import { Printer, ArrowLeft } from "lucide-react";

export function PrintButton() {
  return (
    <div className="flex gap-2">
      <button
        onClick={() => window.history.back()}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
      >
        <Printer className="h-4 w-4" /> Print / Save as PDF
      </button>
    </div>
  );
}
