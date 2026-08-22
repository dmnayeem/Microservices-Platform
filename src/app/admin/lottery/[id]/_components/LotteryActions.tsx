"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, XCircle, Trophy, AlertTriangle, Loader2, AlertCircle, CheckCircle, Calculator } from "lucide-react";

interface LotteryActionsProps {
  lotteryId: string;
  status: string;
  ticketsSold: number;
  /** Shown on the draw confirmation so the outcome is never a surprise. */
  minTickets: number;
  shortfallAction: "DRAW" | "REFUND" | "ROLLOVER";
}

interface DrawPreview {
  prizeMode: string;
  ticketsSold: number;
  shortfall: boolean;
  gross: number;
  houseCut: number;
  pool: number;
  totalPaid: number;
  awards: { position: number; description: string; amount: number }[];
}

export function LotteryActions({
  lotteryId,
  status,
  ticketsSold,
  minTickets,
  shortfallAction,
}: LotteryActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showConfirm, setShowConfirm] = useState<string | null>(null);
  const [preview, setPreview] = useState<DrawPreview | null>(null);

  // A zero-write dry run. Asking "what would this pay?" should never require
  // paying it.
  const loadPreview = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/lottery/${lotteryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't build a preview");
      setPreview(d.preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: string) => {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/admin/lottery/${lotteryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to ${action} lottery`);
      }

      setSuccess(data.message || `Lottery ${action} successfully`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
      setShowConfirm(null);
    }
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Actions</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <p className="text-sm text-emerald-400">{success}</p>
        </div>
      )}

      {!showConfirm ? (
        <div className="space-y-3">
          {status === "UPCOMING" && (
            <button
              onClick={() => handleAction("activate")}
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Activate Lottery
            </button>
          )}

          {status === "ACTIVE" && (
            <>
              <button
                onClick={loadPreview}
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
                Preview the draw
              </button>

              {preview && (
                <div className="p-3 rounded-lg bg-gray-950 border border-gray-800 space-y-2">
                  <p className="text-xs text-gray-400 tabular-nums">
                    {preview.ticketsSold.toLocaleString()} tickets · gross{" "}
                    {preview.gross.toLocaleString()}
                    {preview.houseCut > 0 && <> · cut {preview.houseCut.toLocaleString()}</>}{" "}
                    · pot <span className="text-white font-semibold">{preview.pool.toLocaleString()}</span>
                  </p>
                  {preview.shortfall ? (
                    <p className="text-xs text-amber-400">
                      Below the {minTickets.toLocaleString()}-ticket minimum — drawing
                      now will{" "}
                      {shortfallAction === "REFUND"
                        ? "refund everyone"
                        : shortfallAction === "ROLLOVER"
                          ? "roll the pot into the next draw (no refunds)"
                          : "draw anyway"}
                      .
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {preview.awards.map((a) => (
                        <li key={a.position} className="text-xs text-gray-300 flex justify-between">
                          <span>{a.description}</span>
                          <span className="text-amber-400 font-bold tabular-nums">
                            {a.amount.toLocaleString()} pts
                          </span>
                        </li>
                      ))}
                      {preview.awards.length === 0 && (
                        <li className="text-xs text-gray-500">Nothing would be paid.</li>
                      )}
                    </ul>
                  )}
                </div>
              )}

              <button
                onClick={() => setShowConfirm("draw")}
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50"
              >
                <Trophy className="w-4 h-4" />
                Draw Winners
              </button>
              {ticketsSold === 0 && (
                <p className="text-xs text-gray-500 text-center">
                  Nobody has entered — drawing will close this lottery with no payout.
                </p>
              )}
            </>
          )}

          {(status === "UPCOMING" || status === "ACTIVE") && (
            <button
              onClick={() => setShowConfirm("cancel")}
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              Cancel Lottery
            </button>
          )}

          {status === "COMPLETED" && (
            <div className="text-center text-gray-500 py-4">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
              <p>This lottery has been completed</p>
            </div>
          )}

          {status === "CANCELLED" && (
            <div className="text-center text-gray-500 py-4">
              <XCircle className="w-8 h-8 mx-auto mb-2 text-red-400" />
              <p>This lottery was cancelled</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" />
            <div>
              <p className="text-sm text-amber-400 font-medium">
                {showConfirm === "draw"
                  ? "Draw winners now?"
                  : "Cancel this lottery?"}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {showConfirm === "draw"
                  ? ticketsSold === 0
                    ? "Nobody entered, so this closes the lottery with no winners and no payout."
                    : minTickets > 0 && ticketsSold < minTickets
                      ? shortfallAction === "REFUND"
                        ? `Only ${ticketsSold} of ${minTickets} tickets sold — every ticket will be refunded and no winner is picked.`
                        : shortfallAction === "ROLLOVER"
                          ? `Only ${ticketsSold} of ${minTickets} tickets sold — the pot rolls into the next draw and tickets are NOT refunded.`
                          : "This will randomly select winners and pay out. It cannot be undone."
                      : "This will randomly select winners and pay out. It cannot be undone."
                  : "Cancelled lotteries cannot be reactivated. All sold tickets will be refunded."}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowConfirm(null)}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => handleAction(showConfirm)}
              disabled={loading}
              className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50 ${
                showConfirm === "draw"
                  ? "bg-purple-500 hover:bg-purple-600"
                  : "bg-red-500 hover:bg-red-600"
              }`}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : showConfirm === "draw" ? (
                <Trophy className="w-4 h-4" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              Confirm
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
