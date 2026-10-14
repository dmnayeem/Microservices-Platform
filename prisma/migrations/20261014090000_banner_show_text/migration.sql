-- Banner: show the title / button / dark shade over the picture (default on), or the picture alone.
ALTER TABLE "Banner" ADD COLUMN IF NOT EXISTS "showText" BOOLEAN NOT NULL DEFAULT true;
