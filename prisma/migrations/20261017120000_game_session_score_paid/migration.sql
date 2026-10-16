-- Score already paid per game session, so heartbeats need no GameEarnLog sum (2026-10-17).
ALTER TABLE "GameSession" ADD COLUMN "scorePaid" INTEGER NOT NULL DEFAULT 0;

-- Backfill from the score payouts already logged.
UPDATE "GameSession" s SET "scorePaid" = l.paid
FROM (SELECT "sessionId", SUM("points")::int AS paid FROM "GameEarnLog" WHERE "kind" = 'SCORE' AND "sessionId" IS NOT NULL GROUP BY "sessionId") l
WHERE s."id" = l."sessionId";
