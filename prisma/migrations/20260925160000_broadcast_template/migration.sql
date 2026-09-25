-- Visual template for a broadcast: URGENT, OFFER, UPDATE and the rest.
-- A string, not an enum, so adding a template is a code change rather than a
-- migration and an unknown value falls back to PLAIN.
ALTER TABLE "Broadcast" ADD COLUMN "style" TEXT NOT NULL DEFAULT 'PLAIN';
ALTER TABLE "Broadcast" ADD COLUMN "kicker" TEXT;
