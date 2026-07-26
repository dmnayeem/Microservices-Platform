-- Idempotency backstop for the money ledger: a deterministic `reference` for a
-- once-only event is unique per user, so retries / concurrent-doubles / replays
-- that reuse the same reference hit this constraint (P2002) and are caught.
-- Scoped to userId (not global) because double-entry writes two rows sharing one
-- reference with different userId; NULL references stay unconstrained.

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_userId_reference_key" ON "Transaction"("userId", "reference");
