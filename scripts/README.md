# Scripts

## extract-base44.ts

One-time extraction of restaurant content from the Base44 SQL export.

```bash
npm run extract:base44 -- "C:/path/to/omomoon_database.sql"
```

Reads their dump, normalises the taxonomy, writes `prisma/seed-data/restaurants.json`.

Two steps on purpose: the dump contains real user emails and phone numbers, so
it stays out of the repo, and only the derived restaurant-only JSON is
committed. That also makes the seed reproducible without the original export.

**Normalisation applied**

| Problem in the source | Fix |
| --- | --- |
| 115 cuisine strings, 64 used once | Mapped to 54 canonical; compounds split, so "Chinese / Sushi" tags both Chinese and Japanese |
| 93 neighborhoods, 53 used once, address fragments like "Suite 100" | Mapped to 59; junk dropped, "Miami" recognised as the city not an area |
| Case variants: "Full Bar" 61, "Full bar" 58, "full bar" 17 | Title-cased, collapsed to one tag |
| Sentences in tag columns | Rejected above 32 characters or with prose punctuation |
| Tags matching one restaurant | Dropped below 3 uses, except cuisines and dishes |
| `dish` and `must_order` holding the same values | Deduped |

## sql.ts

Ad-hoc SQL against `DATABASE_URL`, so no psql or Docker is needed.

```bash
npm run db:sql "SELECT count(*) FROM restaurants"
npm run db:sql "\dt"
```

## Known limitation: seed speed

The seeder writes row by row, which means roughly seven sequential round trips
per restaurant. Against Neon in us-east-2 (~250ms each) that is about 15 minutes
for 500 restaurants. Acceptable for a one-time import, and correctness matters
more here than speed.

If it needs to be re-run often, batch it: collect the rows and use
`createMany`, then attach tags in one `createMany` per batch. That trades the
per-row upsert for a truncate-and-reload.
