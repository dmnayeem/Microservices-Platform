-- The unique index below is a MONEY guard: it is what makes "mark this invoice
-- paid" twice credit the advertiser once. Adding it to a table that already has
-- duplicate references would fail halfway and leave an invalid index behind, so
-- prove there are none first. `db execute` cannot return rows, so this raises.
DO $$ DECLARE dupes int; BEGIN
  SELECT count(*) INTO dupes FROM (
    SELECT "userId", reference
    FROM "AdCreditLedger"
    WHERE reference IS NOT NULL
    GROUP BY 1, 2
    HAVING count(*) > 1
  ) d;
  IF dupes > 0 THEN
    RAISE EXCEPTION 'DUPLICATE_LEDGER_REFERENCES: % pair(s) — resolve before adding the unique index', dupes;
  END IF;
END $$;
