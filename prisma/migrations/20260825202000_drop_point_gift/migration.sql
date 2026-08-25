-- `PointGift` was declared, indexed and given two foreign keys, and then never
-- written or read by a single line of application code. The gifting feature that
-- actually shipped is `Donation` (`api/feed/[id]/donate`), which writes
-- `TransactionType.GIFT` and is what the wallet's "Gifts" filter shows.
--
-- Both its FKs are outbound to "User" and nothing references this table, so the
-- constraints and all three indexes drop with it. Verified empty (0 rows) first.
--
-- Side benefit: those FKs were ON DELETE RESTRICT, so any row here would have
-- silently blocked deleting that user.

DROP TABLE "PointGift";
