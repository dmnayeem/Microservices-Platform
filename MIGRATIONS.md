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

Known, still open: several objects reached the live database via `db push` rather
than a migration file, so `prisma/migrations/` alone would **not** rebuild the live
schema from scratch. That only matters for a brand-new environment, not for the
running one. Enumerating them needs either a shadow database or a direct
(non-Accelerate) connection, because `db execute` cannot return query results.

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
Wire this into the platform's **release command** (e.g. a Vercel "release"/predeploy step). It is intentionally
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
