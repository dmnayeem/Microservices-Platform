-- Tax on the platform's marketplace commission.
--
-- The platform's commission is a service it sells, and that service is taxable
-- even though the goods passing through it are the seller's business. The tax
-- is charged on top of the listing price, so the buyer pays price + tax, the
-- seller is unaffected, and the platform collects the tax to remit.
--
-- `tax` is deliberately a separate column from `fee`. `fee` is income; `tax` is
-- money held on a tax authority's behalf. Summing them together would overstate
-- revenue by exactly the amount that has to be paid out again — which is the
-- single easiest way to get this wrong.
--
-- Both default to 0, so every existing purchase reads as "no tax was charged",
-- which is the truth.
ALTER TABLE "MarketplacePurchase"
  ADD COLUMN IF NOT EXISTS "tax" DECIMAL(18,6) NOT NULL DEFAULT 0;

-- The rate, kept per row so a receipt issued today still reconciles after the
-- rate changes. Reading the current setting when rendering an old receipt would
-- quietly restate history.
ALTER TABLE "MarketplacePurchase"
  ADD COLUMN IF NOT EXISTS "taxPct" DECIMAL(9,4) NOT NULL DEFAULT 0;
