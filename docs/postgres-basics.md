# Postgres basics — a working guide

Written for this project. Every command here has been run against your actual
database, so the names and commands are real, not placeholders.

Your database is **Neon** — hosted Postgres 18. There is nothing running on your
machine, and nothing to start.

---

## 1. The mental model

Four nested things. People conflate them constantly and then get confused.

```
Postgres server          ← one process. Yours is Neon, in us-east-2
└── database             ← "neondb". A server can host many, fully isolated
    └── schema           ← "public". A namespace for tables. You'll use one
        └── table        ← "users", "posts"
```

Separately there are **roles** (users). Yours is `neondb_owner`. A role owns
objects and has permissions.

Two things that surprise people coming from MongoDB:

- **Two databases on the same server cannot query each other.** No joins across
  them. If two things need joining, they belong in one database.
- **Postgres lowercases unquoted identifiers.** `createdAt` becomes `createdat`
  unless quoted. Prisma quotes everything, which is why raw SQL against your
  tables needs `"createdAt"` with the double quotes, but `posts` works bare.

---

## 2. The daily loop

You will spend 95% of your time in these. Everything is `npm run` from `backend/`.

There is **nothing to start** — your `DATABASE_URL` points at Neon, which is
always on. Just `npm run dev`.

| When this happens                   | Run this                    |
| ----------------------------------- | --------------------------- |
| You edited `schema.prisma`          | `npm run db:migrate`        |
| You pulled someone's schema changes | `npm run db:generate`       |
| You want to look at your data       | `npm run db:studio`         |
| You want to run a SQL query         | `npm run db:sql "SELECT …"` |
| Data is a mess, start clean         | `npm run db:reset`          |
| Deploying to production             | `npm run db:deploy`         |

### The one rule

**`schema.prisma` is the source of truth.** You never write `CREATE TABLE` or
`ALTER TABLE` by hand. Edit the schema, run `db:migrate`, and Prisma writes the
SQL for you into `prisma/migrations/`.

If you change the database directly with SQL, Prisma won't know, and the next
migration will try to "fix" your change — usually by dropping it.

### migrate vs. deploy — the distinction that matters

```
db:migrate   development only.  Compares schema to DB, WRITES a new .sql
                                migration file, applies it, regenerates client.
                                Can prompt to reset if it detects drift.

db:deploy    production only.   Applies migration files that already exist.
                                Writes nothing, prompts nothing, never resets.
```

Running `db:migrate` against production is how people delete production data.
Use `db:deploy`. Commit `prisma/migrations/` to git — it _is_ your schema history.

### db:push — the one to be careful with

`db:push` syncs the schema without creating a migration file. Fast for throwaway
experiments, but it leaves no history, so your migrations folder and your actual
database silently diverge. Avoid it once a project is real.

---

## 3. Running SQL — three ways, none needing Docker or psql

`psql` is Postgres' official CLI, and it is **not installed on your machine**.
You don't need it. Pick whichever of these suits the moment.

### a) `npm run db:sql` — the one you'll use most

A small script ([`scripts/sql.ts`](../scripts/sql.ts)) that runs any query
against your `DATABASE_URL` and prints a table:

```bash
npm run db:sql "SELECT title, status FROM posts ORDER BY \"createdAt\" DESC"
npm run db:sql "SELECT count(*) FROM posts"
```

```
┌─────────┬───────────────────────┬─────────────┐
│ (index) │ title                 │ status      │
├─────────┼───────────────────────┼─────────────┤
│ 0       │ 'A Draft Post'        │ 'DRAFT'     │
│ 1       │ 'Working with Prisma' │ 'PUBLISHED' │
└─────────┴───────────────────────┴─────────────┘
2 row(s) in 271ms
```

It also understands the psql shortcuts worth knowing:

```bash
npm run db:sql "\dt"          # list tables
npm run db:sql "\d posts"     # describe a table — columns, types, defaults
npm run db:sql "\di"          # list indexes
npm run db:sql "\du"          # list roles
npm run db:sql "\conninfo"    # which database am I actually connected to?
```

### b) Prisma Studio — for browsing and editing rows

```bash
npm run db:studio     # localhost:5555
```

A spreadsheet view of your tables. Faster than SQL for "what's in there?" and
lets you edit or delete rows by clicking. Use this most of the time.

### c) Neon's SQL editor — in the browser

Neon dashboard → your project → **SQL Editor**. Full results, query history,
nothing to install. Handy when you're away from your terminal.

> If you ever _do_ want real `psql`, install it with
> `winget install PostgreSQL.PostgreSQL.17` and connect with
> `psql "$DATABASE_URL"`. Entirely optional.

---

## 4. Inspecting structure

`npm run db:sql "\d posts"` is the fastest way to see what a table actually
looks like — the real columns, types and defaults Prisma produced from your
schema:

```
┌─────────┬───────────────┬───────────────────────────────┬──────────┬─────────────────────────┐
│ (index) │ column        │ type                          │ nullable │ default                 │
├─────────┼───────────────┼───────────────────────────────┼──────────┼─────────────────────────┤
│ 5       │ 'status'      │ 'USER-DEFINED'                │ 'NO'     │ `'DRAFT'::"PostStatus"` │
│ 6       │ 'tags'        │ 'ARRAY'                       │ 'YES'    │ 'ARRAY[]::text[]'       │
│ 9       │ 'createdAt'   │ 'timestamp without time zone' │ 'NO'     │ 'CURRENT_TIMESTAMP'     │
└─────────┴───────────────┴───────────────────────────────┴──────────┴─────────────────────────┘
```

For indexes and foreign keys:

```bash
npm run db:sql "\di"

npm run db:sql "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
                WHERE conrelid = 'posts'::regclass"
```

Which shows the real constraints behind your `@relation`:

```
posts_authorId_fkey  FOREIGN KEY ("authorId") REFERENCES users(id) ON DELETE CASCADE
posts_slug_key       UNIQUE (slug)
```

---

## 5. SQL you'll actually write

Prisma writes your app's queries. You write SQL for inspection and one-off fixes.

```sql
-- Read
SELECT id, title, status FROM posts WHERE status = 'PUBLISHED' LIMIT 10;
SELECT count(*) FROM posts;
SELECT status, count(*) FROM posts GROUP BY status;

-- Join (note the double quotes on camelCase columns)
SELECT p.title, u.email
FROM posts p
JOIN users u ON u.id = p."authorId"
ORDER BY p."createdAt" DESC;

-- Write
UPDATE posts SET status = 'ARCHIVED' WHERE id = '...';
DELETE FROM posts WHERE status = 'DRAFT';

-- Pattern matching: LIKE is case-sensitive, ILIKE is not
SELECT * FROM posts WHERE title ILIKE '%prisma%';
```

### The safety habit worth building now

Before any `UPDATE` or `DELETE`, run it as a `SELECT` first to see what it hits:

```sql
SELECT * FROM posts WHERE status = 'DRAFT';     -- 1 row. Good, that's what I meant.
DELETE   FROM posts WHERE status = 'DRAFT';
```

`DELETE FROM posts;` with no `WHERE` deletes every row. There is no undo and no
confirmation prompt. For anything you're unsure about, wrap it:

```sql
BEGIN;
DELETE FROM posts WHERE status = 'DRAFT';
-- check the row count it reports
ROLLBACK;   -- undo it
-- or
COMMIT;     -- keep it
```

`BEGIN` / `ROLLBACK` is the closest thing to an undo button Postgres has — but
it only works inside one continuous session, so it needs Prisma Studio or Neon's
SQL editor, not `npm run db:sql` (each of those runs is its own connection).

On Neon there is a better version of this: **branch first, experiment freely,
delete the branch.** See §7.

---

## 6. When something is wrong

### "Is my index actually being used?"

The single most useful diagnostic in Postgres:

```sql
EXPLAIN ANALYZE
SELECT * FROM posts WHERE status='PUBLISHED' ORDER BY "createdAt" DESC LIMIT 10;
```

```
Limit  (cost=0.15..8.17 rows=1) (actual time=0.265..0.268 rows=2 loops=1)
  ->  Index Scan using "posts_status_createdAt_idx" on posts
        Index Cond: (status = 'PUBLISHED'::"PostStatus")
Execution Time: 0.319 ms
```

Read it bottom-up. **`Index Scan`** = good, it used the index. **`Seq Scan`** on
a large table = it read every row; you probably need an index.

(`Seq Scan` on a tiny table is fine and expected — Postgres correctly decides
scanning 3 rows is cheaper than consulting an index.)

### "Everything is slow / hanging"

```sql
-- What is running right now?
SELECT pid, state, now() - query_start AS duration, left(query, 80)
FROM pg_stat_activity
WHERE state <> 'idle' AND pid <> pg_backend_pid()
ORDER BY duration DESC;

-- Kill a stuck query (politely, then forcefully)
SELECT pg_cancel_backend(12345);
SELECT pg_terminate_backend(12345);
```

A query stuck for minutes is usually waiting on a **lock** — something else has
an open transaction it never committed.

### "P2028: Unable to start a transaction in the given time"

Prisma allows 2 seconds to acquire a connection and `BEGIN` a transaction. A
remote database, or a Neon compute waking from zero, can exceed that.

Fix it by not using a transaction where you don't need one — a read-only list
plus its total count gains nothing from isolation, so use `Promise.all` and the
two queries run concurrently with no transaction to time out. Raise the limits
only where you genuinely need atomicity:

```ts
await prisma.$transaction([...], { maxWait: 10_000, timeout: 20_000 });
```

### "Too many connections"

```sql
SELECT count(*) AS connections, current_setting('max_connections') AS max
FROM pg_stat_activity;
```

Default max is 100. If you're near it, something is creating clients in a loop —
which is exactly why [`shared/prisma.ts`](../src/shared/prisma.ts) exports one
shared `PrismaClient`. Never call `new PrismaClient()` in a module.

### "How big is it getting?"

```sql
SELECT relname AS table,
       pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

Matters on a free tier with a 0.5 GB cap.

---

## 7. Safety nets — branches and restore

**Neon backs up automatically.** Dashboard → your project → **Backup & Restore**
gives you point-in-time restore: pick a timestamp, get the database as it was.
That covers the disaster case without you doing anything.

### Branching — the one to actually learn

A Neon **branch** is a copy-on-write clone of your whole database. It appears
instantly, costs nothing extra on the free plan, and is completely isolated from
`main`. This is your undo button for anything scary:

1. Neon dashboard → **Branches** → **Create branch** from `main`
2. Copy its connection string into `.env`
3. Run the risky migration, or the `DELETE` you're unsure about
4. See what happened. If it's wrong, delete the branch — `main` never moved
5. Put the original URL back in `.env`

That workflow is the reason this project is on Neon rather than a plain host.
It turns "I hope this migration is right" into something you can just try.

### A real file on disk, if you want one

`pg_dump` ships with the Postgres client tools
(`winget install PostgreSQL.PostgreSQL.17`), and works against any URL:

```bash
pg_dump "$DATABASE_URL" -Fc > backup.dump
pg_restore -d "$DATABASE_URL" --clean backup.dump

# Schema only, human-readable — shows the real SQL Prisma generated
pg_dump "$DATABASE_URL" --schema-only
```

---

## 8. Footguns, in the order you'll meet them

1. **Adding a required column to a table with existing rows fails.** Postgres has
   nothing to put in the old rows. Give it a default (`@default("")`) or make it
   optional (`String?`), migrate, backfill, then tighten.

2. **Renaming a field in `schema.prisma` reads as drop + add.** Prisma sees a
   column vanish and another appear — and the data goes with it. For a real
   rename, generate the migration with `--create-only`, edit the SQL to
   `ALTER TABLE ... RENAME COLUMN`, then apply.

3. **`db:reset` is unrecoverable.** It drops the whole database. Fine locally,
   catastrophic anywhere else. It's why `db:deploy` exists for production.

4. **camelCase columns need double quotes in raw SQL.** `"createdAt"`, not
   `createdAt`. Prisma insulates you from this until the moment you open psql.

5. **`NULL` is not equal to anything, including `NULL`.** `WHERE excerpt = NULL`
   returns nothing, always. Use `IS NULL` / `IS NOT NULL`.

6. **Timestamps have no timezone here.** Prisma stores UTC. Convert for display
   in the frontend, never in the database.

7. **Indexes make writes slower.** They're not free — add them for queries you
   actually run, which is why the two on `posts` match the API's real filters.

---

## 9. Cheat sheet

```bash
npm run dev              # start the API — nothing else to start

# Looking at data
npm run db:studio        # GUI at localhost:5555
npm run db:sql "\dt"     # list tables
npm run db:sql "\d posts"                       # describe a table
npm run db:sql "SELECT count(*) FROM posts"     # any query

# Schema changes
npm run db:migrate       # dev: create + apply a migration
npm run db:deploy        # prod: apply existing migrations
npm run db:generate      # regenerate the typed client after a git pull
npm run db:seed          # load demo data
npm run db:reset         # DESTRUCTIVE: drop, re-migrate, re-seed
```

```sql
-- Is the index used? Index Scan = good, Seq Scan on a big table = bad
EXPLAIN ANALYZE SELECT * FROM posts WHERE status='PUBLISHED';

-- camelCase columns need double quotes in raw SQL
SELECT title, "createdAt" FROM posts ORDER BY "createdAt" DESC;

-- IS NULL, never = NULL
SELECT * FROM posts WHERE excerpt IS NULL;
```

> **Scared of a change?** Make a Neon branch, point `.env` at it, try it there.
> See §7.
