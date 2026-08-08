"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Download,
  ChevronDown,
  FileText,
  Users,
  Activity,
  DollarSign,
  ArrowRightLeft,
  Eye,
  Loader2,
} from "lucide-react";

interface ExportDropdownProps {
  period: string;
}

const EXPORT_OPTIONS = [
  {
    type: "summary",
    label: "Summary Report",
    description: "Daily metrics overview",
    icon: FileText,
  },
  {
    type: "users",
    label: "Users Report",
    description: "User registrations and details",
    icon: Users,
  },
  {
    type: "tasks",
    label: "Tasks Report",
    description: "Task submissions and completions",
    icon: Activity,
  },
  {
    type: "withdrawals",
    label: "Withdrawals Report",
    description: "Withdrawal requests and payouts",
    icon: DollarSign,
  },
  {
    type: "transactions",
    label: "Transactions Report",
    description: "All financial transactions",
    icon: ArrowRightLeft,
  },
  {
    type: "traffic",
    label: "Traffic Report",
    description: "Page & task-page views, visitors, time",
    icon: Eye,
  },
];

export function ExportDropdown({ period }: ExportDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  const handleExport = async (type: string) => {
    setLoading(type);
    try {
      const response = await fetch(
        `/api/admin/analytics/export?period=${period}&type=${type}`
      );

      if (!response.ok) {
        throw new Error("Export failed");
      }

      // Get the blob and create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      // Get filename from response headers
      const contentDisposition = response.headers.get("content-disposition");
      const filename = contentDisposition
        ? contentDisposition.split("filename=")[1]?.replace(/"/g, "")
        : `earngpt-${type}-report.csv`;

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export report. Please try again.");
    } finally {
      setLoading(null);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
      >
        <Download className="w-4 h-4" />
        Export Report
        <ChevronDown
          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-72 bg-gray-900 border border-gray-800 rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="p-3 border-b border-gray-800">
              <p className="text-sm font-medium text-white">Export Reports</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Export data for the selected period ({period})
              </p>
            </div>

            <div className="p-2 space-y-1">
              {EXPORT_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isLoading = loading === option.type;

                return (
                  <button
                    key={option.type}
                    onClick={() => handleExport(option.type)}
                    disabled={loading !== null}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="p-2 bg-gray-800 rounded-lg">
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                      ) : (
                        <Icon className="w-4 h-4 text-indigo-400" />
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-white">
                        {option.label}
                      </p>
                      <p className="text-xs text-gray-500">
                        {option.description}
                      </p>
                    </div>
                    <Download className="w-4 h-4 text-gray-500" />
                  </button>
                );
              })}
            </div>

            <div className="p-3 border-t border-gray-800 bg-gray-800/50">
              <p className="text-xs text-gray-500 text-center">
                Reports are exported as CSV files
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
