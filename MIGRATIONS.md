# Database migrations

This project uses **Prisma Migrate** with a committed migration history under `prisma/migrations/`.
The database is **Prisma Postgres** (`DATABASE_URL` = `prisma+postgres://…`, Accelerate-backed); the Prisma 7
CLI runs `migrate` directly against it — no separate `directUrl`, and the shadow database used by
`migrate dev` is auto-provisioned.

The history was **baselined** on 2026-07-25: the schema built incrementally with `db push` during early
development was captured as `prisma/migrations/0_init` and marked already-applied (`migrate resolve --applied`).

### State as of 2026-08-20

`migrate status` → **"Database schema is up to date"** (32 migrations). Getting there
required marking `20260816185008_submission_feedback_penalty` as applied — its two
columns were already live, only the history row was missing.

`migrate diff --from-config-datasource --to-schema` (live DB vs `schema.prisma`) is
clean apart from cosmetics: four FK constraints Prisma would re-declare with a
different `onUpdate`, and four `DROP DEFAULT`s. **Deliberately not applied** — they
change nothing at runtime and would mean dropping and re-adding foreign keys on a
live database.

Several objects reached the live database via `db push` rather than a migration
file. **Closed 2026-10-06** by `20261006400100_backfill_untracked_objects` — see
"Backfilled objects" and "Fresh database" below.

## Backfilled objects (`20261006400100_backfill_untracked_objects`)

Found by checking every model / scalar column / `@@index` / `@@unique` / relation
FK in `schema.prisma` against the CREATE/ALTER statements in `prisma/migrations`.
These were in the schema (and on the live DB, via `db push` on 2026-08-17/18) but
no migration ever created them:

- enum `EventActionType`
- tables `Event`, `UserEventProgress`, `BrowseEarnLog`, `PostBoostView` (+ their
  indexes, uniques and the 4 FKs of UserEventProgress / PostBoostView)
- columns `User.pageOverrides/signupIp/lastIp`; `Task.hidden/genders/regions/
  divisions/districts/subDistricts/postalCodes/minAge/maxAge`;
  `Package.targetTasksEnabled`; `AffiliateClick.visitorHash`; `Post.boostedUntil`;
  `AuditLog.targetUserId/summary`
- indexes of the same family: `User_signupIp_idx`, `User_{country,gender,division,
  district,subDistrict,city,region,language,dateOfBirth}_idx`,
  `User_country_gender_idx`, `AffiliateClick_visitorHash_idx`,
  `AuditLog_targetUserId_createdAt_idx`, `AuditLog_action_idx`

Every statement is `IF NOT EXISTS` / `duplicate_object`-guarded and uses Prisma's
generated names and types (checked against `migrate diff --from-empty
--to-schema`), so on the live database it is a **strict no-op**. It is applied by
`migrate deploy` like any other migration.

## Fresh database (new environment / staging)

The history **cannot** be replayed by one `migrate deploy` on an empty database,
for two independent reasons:

1. 13 migrations use `CREATE INDEX CONCURRENTLY` (and `20260821120000` uses
   `ALTER TYPE … ADD VALUE`), which cannot run inside the transaction Prisma runs
   a migration file in. Those were applied live one statement at a time with
   `db execute` + `migrate resolve --applied` (see "Adding an index" below).
2. Earlier migrations already reference the backfilled objects:
   `20260820120000_hot_path_indexes` (Task.hidden, Post.boostedUntil),
   `20260821120000_event_progress_tracking` (ALTERs Event / UserEventProgress /
   EventActionType), `20260822190000_missions_live` (uses EventActionType),
   `20261003100000_pwa_install`, `20261006100500_plan_badge_event_money`
   (UserEventProgress). The backfill sorts after them; history is not reordered.

**Recommended procedure (schema-first baseline)**, against the NEW database's URL:
```
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script -o fresh.sql
npx prisma db execute --file fresh.sql
# raw-SQL objects Prisma cannot declare (all IF NOT EXISTS, safe to re-run):
npx prisma db execute --file prisma/migrations/20260928200000_audit_indexes/migration.sql
npx prisma db execute --file prisma/migrations/20261005100000_plans_and_paid_badges/migration.sql
npx prisma db execute --file prisma/migrations/20261006400200_perf_indexes/migration.sql
npx prisma db execute --file prisma/migrations/20261006400300_unique_guards/migration.sql
# trigram indexes (need pg_trgm): run the two User_*_trgm_idx statements from
# 20260820120000_hot_path_indexes one at a time (they are CONCURRENTLY)
# then mark the whole history applied:
for d in prisma/migrations/*/; do npx prisma migrate resolve --applied "$(basename "$d")"; done
npx prisma migrate status      # -> up to date
```
Review each `db execute` file before running it (some contain data
backfills that are harmless on an empty DB).

**Replay procedure (if you must replay history)**: `migrate deploy` up to
`20260730000200_affiliate_program`, then `npx prisma db execute --file
prisma/migrations/20261006400100_backfill_untracked_objects/migration.sql` (all
tables it touches exist by then), then continue; for every CONCURRENTLY /
`ADD VALUE` migration apply its statements one by one with `db execute` and
`migrate resolve --applied <name>`. When `migrate deploy` reaches the backfill it
is a no-op.

## Raw-SQL indexes — must never be dropped

Prisma cannot declare these (partial / trigram / expression indexes), so `migrate
dev` / `migrate diff` will propose `DROP INDEX` for them. **Delete those lines from
any generated migration.** `npm run check:migration-drops`
(`scripts/check-migration-drops.ts`) fails if any migration drops one, and
`deploy.sh` runs it before `migrate deploy`.

| Index | Created in | Why |
|---|---|---|
| `TaskSubmission_one_open_per_user_task` | 20260928200000_audit_indexes | partial unique: one open submission per user+task (double-pay guard) |
| `User_name_trgm_idx`, `User_username_trgm_idx` | 20260820120000_hot_path_indexes | trigram: admin user search |
| `User_blueBadgeExpiresAt_idx` | 20261005100000_plans_and_paid_badges | partial (`WHERE … IS NOT NULL`) |
| `TaskSubmission_buyerReport_status_idx` | 20261006400200_perf_indexes | expression `(metadata->'buyerReport'->>'status')` |
| `MarketplaceDispute_one_open_per_purchase` | 20261006400300_unique_guards | partial unique: one active dispute per purchase |
| `CreatorApplication_one_pending_per_user_type` | 20261006400300_unique_guards | partial unique: one PENDING application per user per type |
| `TutorApplication_one_pending_per_user` | 20261006400300_unique_guards | partial unique: one PENDING tutor application per user |

Adding a new raw-SQL index: add it to this table **and** to `PROTECTED_INDEXES` in
the script.

## Perf indexes (`20261006400200_perf_indexes`)

`Subscription_isActive_endDate_idx`, `Transaction_reference_pattern_idx`
(`text_pattern_ops`, declared with `map:` because Prisma's default name collides
with `Transaction_reference_idx`), `TaskSubmission_buyerReport_status_idx`
(raw only), `MarketplacePurchase_status_idx`. Plain `CREATE INDEX` (no
CONCURRENTLY) so it runs under `migrate deploy`; each blocks writes on its table
while building — `Transaction` is the biggest, so deploy at a quiet hour.

## Unique guards (`20261006400300_unique_guards`)

A `CREATE UNIQUE INDEX` **fails if duplicates exist**, which fails `migrate
deploy` (deploy.sh keeps the old build serving; afterwards `npx prisma migrate
resolve --rolled-back 20261006400300_unique_guards`, dedupe, redeploy). Check
first — each query must return 0 rows:

```sql
-- 1. LinkedPlatformAccount: one external account per user
SELECT "platform", "platformUserId", count(*) FROM "LinkedPlatformAccount"
GROUP BY 1, 2 HAVING count(*) > 1;
-- dedupe: keep the most recently linked row (the account that linked last)
DELETE FROM "LinkedPlatformAccount" a USING "LinkedPlatformAccount" b
WHERE a."platform" = b."platform" AND a."platformUserId" = b."platformUserId"
  AND (a."linkedAt", a."id") < (b."linkedAt", b."id");

-- 2. MarketplaceDispute: one active dispute per purchase
SELECT "purchaseId", count(*) FROM "MarketplaceDispute"
WHERE "status" IN ('OPEN','IN_REVIEW','ESCALATED') GROUP BY 1 HAVING count(*) > 1;
-- dedupe: keep the OLDEST active one, close the rest (no delete — disputes carry messages)
UPDATE "MarketplaceDispute" d SET "status" = 'CLOSED', "updatedAt" = now()
WHERE d."status" IN ('OPEN','IN_REVIEW','ESCALATED') AND EXISTS (
  SELECT 1 FROM "MarketplaceDispute" o
  WHERE o."purchaseId" = d."purchaseId" AND o."status" IN ('OPEN','IN_REVIEW','ESCALATED')
    AND (o."createdAt", o."id") < (d."createdAt", d."id"));

-- 3. CreatorApplication: one PENDING per user per type
SELECT "userId", "type", count(*) FROM "CreatorApplication"
WHERE "status" = 'PENDING' GROUP BY 1, 2 HAVING count(*) > 1;
-- dedupe: keep the newest pending, reject the older ones
UPDATE "CreatorApplication" a SET "status" = 'REJECTED', "adminNote" = 'Duplicate pending application'
WHERE a."status" = 'PENDING' AND EXISTS (
  SELECT 1 FROM "CreatorApplication" b
  WHERE b."userId" = a."userId" AND b."type" = a."type" AND b."status" = 'PENDING'
    AND (b."createdAt", b."id") > (a."createdAt", a."id"));

-- 4. TutorApplication: one PENDING per user
SELECT "userId", count(*) FROM "TutorApplication"
WHERE "status" = 'PENDING' GROUP BY 1 HAVING count(*) > 1;
-- dedupe: keep the newest pending, reject the older ones
UPDATE "TutorApplication" a SET "status" = 'REJECTED'
WHERE a."status" = 'PENDING' AND EXISTS (
  SELECT 1 FROM "TutorApplication" b
  WHERE b."userId" = a."userId" AND b."status" = 'PENDING'
    AND (b."createdAt", b."id") > (a."createdAt", a."id"));
```
(`db execute` cannot return rows — run the SELECTs in Prisma Studio / the Prisma
Postgres console, or wrap them in a `DO` block that `RAISE EXCEPTION`s on a
non-zero count, as in "Adding an index" below.)

The LinkedPlatformAccount unique replaces the plain
`LinkedPlatformAccount_platform_platformUserId_idx` (dropped in the same file;
the unique index serves the same lookups).

## Adding an index to a live database

`CREATE INDEX` takes a lock that blocks writes for the duration of the build, so on a
database with real traffic use `CONCURRENTLY`. It **cannot run inside a transaction**,
which means it will fail under `migrate deploy` and cannot be batched — Prisma sends a
whole `db execute` file as one command. The working procedure (used for
`20260820120000_hot_path_indexes`):

1. Write the migration with `CREATE INDEX CONCURRENTLY IF NOT EXISTS …`.
2. Split it and apply **one statement per `prisma db execute --file` invocation**.
3. Check nothing was left half-built — a failed concurrent build leaves an invalid
   index behind:
   ```sql
   DO $$ DECLARE bad int; BEGIN
     SELECT count(*) INTO bad FROM pg_index WHERE NOT indisvalid;
     IF bad > 0 THEN RAISE EXCEPTION 'INVALID_INDEXES_PRESENT: %', bad; END IF;
   END $$;
   ```
   (`db execute` reports success/failure only, so assert inside a `DO` block rather
   than trying to SELECT a result.)
4. `npx prisma migrate resolve --applied <migration_name>`.

Note `db execute` in Prisma 7 takes no `--schema` flag; it reads the datasource from
`prisma.config.ts`.

## Everyday workflow — changing the schema

1. Edit `prisma/schema.prisma`.
2. Create + apply a migration in dev:
   ```
   npm run db:migrate -- --name <short_snake_case_description>
   ```
   This generates a timestamped folder in `prisma/migrations/`, applies it to your dev DB, and regenerates the
   client.
3. **Review the generated `migration.sql`** before committing — especially for destructive changes (dropped
   columns/tables, type narrowing). Prisma flags data-loss steps; don't rubber-stamp them.
4. Commit the new `prisma/migrations/**` folder together with the `schema.prisma` change. Migrations are part
   of the repo and must be reviewed like code.

## Releasing to production

The deploy/release step must apply pending migrations before the new app code serves traffic:
```
npm run db:migrate:deploy      # prisma migrate deploy — applies pending migrations, no prompts, no shadow DB
```
On the VPS this is wired in: `deploy.sh` step 3b runs `check:migration-drops` and then
`prisma migrate deploy` in the builder container (same `.env`) after the build and
**before** traffic switches; a failure aborts the deploy and the old build keeps
serving. `SKIP_MIGRATE=1 ./deploy.sh` skips it once. A migration that failed
mid-way is recorded as failed and blocks later deploys until
`npx prisma migrate resolve --rolled-back <name>`.

Elsewhere, wire this into the platform's **release command** (e.g. a Vercel "release"/predeploy step). It is intentionally
**not** part of `next build`: build-time DB writes run on every preview/branch build and are a footgun. If you
do decide to run it at build time, do so deliberately and only against the production `DATABASE_URL`.

Check state at any time:
```
npm run db:migrate:status
```

## `db:push` is dev-scratch only

`npm run db:push` (`prisma db push`) mutates the DB to match the schema **without** recording a migration. Use
it only for throwaway local prototyping. Never use it against a database that ships — it creates drift the
migration history can't see. For anything that must reach staging/production, use `db:migrate`.

## If drift ever appears

`migrate status` will warn if the DB no longer matches the applied migrations (e.g. someone ran `db push` on a
shared DB). Reconcile by generating a corrective migration:
```
npx prisma migrate diff --from-schema prisma/schema.prisma --to-config-datasource --exit-code   # 0 = no drift, 2 = drift
```
Then create a migration that captures the intended state, review its SQL, and commit it.
