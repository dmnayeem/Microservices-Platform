# Database migrations

This project uses **Prisma Migrate** with a committed migration history under `prisma/migrations/`.
The database is **Prisma Postgres** (`DATABASE_URL` = `prisma+postgres://…`, Accelerate-backed); the Prisma 7
CLI runs `migrate` directly against it — no separate `directUrl`, and the shadow database used by
`migrate dev` is auto-provisioned.

The history was **baselined** on 2026-07-25: the schema built incrementally with `db push` during early
development was captured as `prisma/migrations/0_init` and marked already-applied (`migrate resolve --applied`),
so the migration history, `schema.prisma`, and the live database all agree (verified with
`migrate diff … --exit-code` → "No difference detected").

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
