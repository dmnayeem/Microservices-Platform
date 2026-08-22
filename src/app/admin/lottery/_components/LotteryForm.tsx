"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DateField } from "@/components/ui/date-field";
import {
  Save,
  X,
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
  Trophy,
} from "lucide-react";

interface Prize {
  position: number;
  amount: number;
  description: string;
}

interface LotteryFormProps {
  lottery?: {
    id: string;
    title: string;
    description: string | null;
    startDate: string;
    endDate: string;
    drawDate: string;
    ticketPrice: number;
    maxTickets: number | null;
    maxTicketsPerUser: number;
    prizes: Prize[];
  };
}

export function LotteryForm({ lottery }: LotteryFormProps) {
  const router = useRouter();
  const isEdit = !!lottery;

  const [formData, setFormData] = useState({
    title: lottery?.title || "",
    description: lottery?.description || "",
    startDate: lottery?.startDate || "",
    endDate: lottery?.endDate || "",
    drawDate: lottery?.drawDate || "",
    ticketPrice: lottery?.ticketPrice || 100,
    maxTickets: lottery?.maxTickets || "",
    maxTicketsPerUser: lottery?.maxTicketsPerUser || 10,
  });

  const [prizes, setPrizes] = useState<Prize[]>(
    lottery?.prizes || [
      { position: 1, amount: 10000, description: "Grand Prize" },
      { position: 2, amount: 5000, description: "Second Prize" },
      { position: 3, amount: 2500, description: "Third Prize" },
    ]
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Validation
    if (!formData.title.trim()) {
      setError("Title is required");
      setLoading(false);
      return;
    }

    if (!formData.startDate || !formData.endDate || !formData.drawDate) {
      setError("All dates are required");
      setLoading(false);
      return;
    }

    if (prizes.length === 0) {
      setError("At least one prize is required");
      setLoading(false);
      return;
    }

    try {
      const payload = {
        ...formData,
        maxTickets: formData.maxTickets ? parseInt(formData.maxTickets.toString()) : null,
        prizes,
      };

      const url = isEdit
        ? `/api/admin/lottery/${lottery.id}`
        : "/api/admin/lottery";
      const method = isEdit ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save lottery");
      }

      router.push("/admin/lottery");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const addPrize = () => {
    const newPosition = prizes.length + 1;
    setPrizes([
      ...prizes,
      { position: newPosition, amount: 1000, description: `Prize ${newPosition}` },
    ]);
  };

  const removePrize = (index: number) => {
    const newPrizes = prizes.filter((_, i) => i !== index);
    // Reorder positions
    setPrizes(newPrizes.map((p, i) => ({ ...p, position: i + 1 })));
  };

  const updatePrize = (index: number, field: keyof Prize, value: unknown) => {
    const newPrizes = [...prizes];
    if (field === "amount") {
      newPrizes[index].amount = value as number;
    } else if (field === "description") {
      newPrizes[index].description = value as string;
    }
    setPrizes(newPrizes);
  };

  const totalPrizePool = prizes.reduce((sum, p) => sum + p.amount, 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Basic Info */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white mb-4">Basic Information</h2>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Weekly Grand Draw"
            className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Description
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Enter lottery description..."
            rows={3}
            className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
          />
        </div>
      </div>

      {/* Schedule */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white mb-4">Schedule</h2>

        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Start Date <span className="text-red-400">*</span>
            </label>
            <DateField
              type="datetime-local"
              value={formData.startDate}
              onChange={(v) => setFormData({ ...formData, startDate: v })}
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              End Date <span className="text-red-400">*</span>
            </label>
            <DateField
              type="datetime-local"
              value={formData.endDate}
              onChange={(v) => setFormData({ ...formData, endDate: v })}
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Draw Date <span className="text-red-400">*</span>
            </label>
            <DateField
              type="datetime-local"
              value={formData.drawDate}
              onChange={(v) => setFormData({ ...formData, drawDate: v })}
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Ticket Settings */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white mb-4">Ticket Settings</h2>

        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Ticket Price (Points) <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              min="1"
              value={formData.ticketPrice}
              onChange={(e) =>
                setFormData({ ...formData, ticketPrice: parseInt(e.target.value) || 0 })
              }
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Max Tickets (leave empty for unlimited)
            </label>
            <input
              type="number"
              min="1"
              value={formData.maxTickets}
              onChange={(e) => setFormData({ ...formData, maxTickets: e.target.value })}
              placeholder="Unlimited"
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Max Tickets Per User
            </label>
            <input
              type="number"
              min="1"
              value={formData.maxTicketsPerUser}
              onChange={(e) =>
                setFormData({ ...formData, maxTicketsPerUser: parseInt(e.target.value) || 1 })
              }
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Prizes */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-white">Prizes</h2>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-sm text-gray-400">
              Total Pool:{" "}
              <span className="text-amber-400 font-semibold">
                {totalPrizePool.toLocaleString()} pts
              </span>
            </p>
            <button
              type="button"
              onClick={addPrize}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-800 text-white rounded-lg hover:bg-gray-700 text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Prize
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {prizes.map((prize, index) => (
            <div
              key={index}
              className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-lg"
            >
              <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-amber-500/10 rounded-lg">
                <span className="text-lg font-bold text-amber-400">#{prize.position}</span>
              </div>

              <div className="flex-1 grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Prize Amount (Points)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={prize.amount}
                    onChange={(e) =>
                      updatePrize(index, "amount", parseInt(e.target.value) || 0)
                    }
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={prize.description}
                    onChange={(e) => updatePrize(index, "description", e.target.value)}
                    placeholder="Prize description"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {prizes.length > 1 && (
                <button
                  type="button"
                  onClick={() => removePrize(index)}
                  className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Submit Buttons */}
      <div className="flex items-center justify-between pt-4">
        <button
          type="button"
          onClick={() => router.push("/admin/lottery")}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
          Cancel
        </button>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Save className="w-5 h-5" />
          )}
          {isEdit ? "Save Changes" : "Create Lottery"}
        </button>
      </div>
    </form>
  );
}
