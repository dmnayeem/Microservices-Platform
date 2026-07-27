-- Per-space ad-rotation interval (seconds). Null = use the global default.
ALTER TABLE "AdPlacement" ADD COLUMN "rotationSeconds" INTEGER;
