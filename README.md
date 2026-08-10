# omomoom API

REST API built with **Express 5 · TypeScript · Prisma 7 · PostgreSQL 17**.

Layout follows the module pattern from `horizzon-backend` (`route → controller →
service`), reworked for a SQL database and tightened up for production use.

---

## 1. Quick start

```bash
cd backend

npm install          # dependencies
npm run dev          # http://localhost:5001
```

That's it — the database is **Neon** (cloud Postgres), so there is nothing to
start locally. `DATABASE_URL` in `.env` already points at it, and the tables and
demo data are already there.

Check that it works:

```bash
curl http://localhost:5001/api/v1/health
```

> **The API uses port 5001**, not 5000 — Windows' `http.sys` reserves 5000 and
> silently swallows the traffic. Configurable in `.env`.

<details>
<summary>Optional: running Postgres locally instead</summary>

A `docker-compose.yml` is included if you ever want an offline database — a
plane, or a migration you'd rather not run against the cloud:

```bash
npm run docker:up    # Postgres on host port 5433
# then swap DATABASE_URL in .env to the commented-out local one
npm run db:migrate
npm run db:seed
```

Local queries are ~2 ms vs ~250 ms to Neon (us-east-2). Not required for
anything, and Neon branches cover most of what you'd want it for.

</details>

---
## 2. The API

The sample Post module has been removed now that the stack is verified. What
remains is the skeleton plus one real endpoint:

| Method | Path              | Description                            |
| ------ | ----------------- | -------------------------------------- |
| `GET`  | `/`               | Root ping — "is anything listening?"    |
| `GET`  | `/api/v1/health`  | Liveness + a real round-trip to Postgres |

```bash
curl http://localhost:5001/api/v1/health
```

```jsonc
{
  "success": true,
  "statusCode": 200,
  "message": "Service is healthy",
  "data": {
    "status": "ok",
    "database": "up",
    "databaseLatencyMs": 251.15,
    "uptimeSeconds": 12,
    "timestamp": "2026-08-03T15:14:48.248Z"
  }
}
```

Point your uptime monitor at `/api/v1/health` — it returns `503` if the database
is unreachable, so a `200` means the API can actually serve traffic.

Build your first real module with the recipe in §5.

## 3. Response contract

**Every** response uses the same envelope, so the frontend can write one typed
`fetch` wrapper and never special-case a route.

Success:

```jsonc
{ "success": true, "statusCode": 200, "message": "…", "meta": { … }, "data": … }
```

Failure — same shape, always with a machine-readable `errorDetails` array where
`path` is the offending **form field name**:

```jsonc
{
  "success": false,
  "statusCode": 400,
  "message": "Validation error",
  "errorDetails": [
    { "path": "title", "message": "Title must be at least 3 characters" },
    { "path": "authorId", "message": "authorId must be a valid UUID" },
  ],
}
```

That maps directly onto React Hook Form:

```ts
errorDetails.forEach((e) => setError(e.path, { message: e.message }));
```

`stack` is included in development only. Every response also carries an
`x-request-id` header — paste it into your log search to find the exact request.

Status codes you can rely on: `400` validation · `401` missing/expired token ·
`403` wrong role · `404` not found · `409` duplicate unique value ·
`429` rate limited · `500` unexpected.

---

## 4. Project structure

```
backend/
├── prisma/
│   ├── schema.prisma          # models — the source of truth for the DB
│   ├── migrations/            # generated SQL history (commit these)
│   └── seed.ts                # demo data
├── scripts/sql.ts             # `npm run db:sql "SELECT …"`
├── docs/postgres-basics.md    # Postgres/Prisma guide for this project
├── src/
│   ├── app/
│   │   ├── middlewares/
│   │   │   ├── auth.ts               # JWT + role guard
│   │   │   ├── globalErrorHandler.ts # every error becomes JSON here
│   │   │   ├── notFound.ts           # unmatched routes
│   │   │   ├── requestLogger.ts      # one structured log line per request
│   │   │   └── validateRequest.ts    # Zod validation
│   │   ├── modules/
│   │   │   └── health/               # ← your feature modules go beside this
│   │   │       └── health.route.ts
│   │   └── routes/index.ts       # mounts every module under /api/v1
│   ├── config/index.ts           # env vars, validated at boot
│   ├── errors/                   # ApiError + Zod/Prisma error translation
│   ├── generated/prisma/         # generated client (git-ignored)
│   ├── helpers/                  # pagination, JWT
│   ├── interfaces/               # shared response/pagination types
│   ├── shared/                   # prisma singleton, logger, sendResponse, …
│   ├── types/express.d.ts        # adds req.user / req.id to Express
│   ├── app.ts                    # middleware chain
│   └── server.ts                 # boot + graceful shutdown
└── docker-compose.yml            # optional local Postgres
```

A feature module is always the same six files:

```
src/app/modules/<name>/
├── <name>.constant.ts     # filterable / searchable / sortable field lists
├── <name>.controller.ts   # req → service → sendResponse (no logic)
├── <name>.interface.ts    # types inferred from the Zod schemas
├── <name>.route.ts        # URLs + middleware chain
├── <name>.service.ts      # business rules + Prisma queries
└── <name>.validation.ts   # request schemas
```

### The request flow

```
request
  → helmet / cors / parsers / logger / rate-limit      (app.ts)
  → router                                             (app/routes/index.ts)
  → validateRequest(schema)                            (rejects bad input: 400)
  → auth(...roles)                                     (optional: 401 / 403)
  → controller                                         (reads req, calls service)
  → service                                            (business rules + Prisma)
  → sendResponse                                       (uniform JSON)
  ↳ any thrown error → globalErrorHandler → uniform JSON
```

---

## 5. Adding a new feature (the whole recipe)

Say you want products. Four steps, and nothing outside the new folder changes
except one line in the router.

### 1. Model it in `prisma/schema.prisma`

```prisma
model Product {
  id          String   @id @default(uuid(7))
  name        String
  price       Decimal  @db.Decimal(10, 2)
  description String?
  isActive    Boolean  @default(true)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([isActive, createdAt(sort: Desc)])
  @@map("products")
}
```

### 2. Migrate

Writes the SQL, applies it, and regenerates the typed client:

```bash
npm run db:migrate -- --name add_products
```

### 3. Create `src/app/modules/product/`

**`product.validation.ts`** — the request contract. Types are inferred from it,
so the rules and the types can never drift apart.

```ts
import { z } from 'zod';

const createProduct = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters'),
    price: z.coerce.number().positive('Price must be greater than 0'),
    description: z.string().trim().max(500).optional(),
  }),
});

const getProducts = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    searchTerm: z.string().trim().optional(),
  }),
});

const productIdParam = z.object({
  params: z.object({ id: z.uuid('id must be a valid UUID') }),
});

export const ProductValidation = { createProduct, getProducts, productIdParam };
```

**`product.constant.ts`**

```ts
export const PRODUCT_FILTERABLE_FIELDS = ['searchTerm', 'isActive'] as const;
export const PRODUCT_SEARCHABLE_FIELDS = ['name', 'description'] as const;
export const PRODUCT_SORTABLE_FIELDS = ['createdAt', 'name', 'price'] as const;
```

**`product.interface.ts`**

```ts
import type { z } from 'zod';
import type { ProductValidation } from './product.validation';

export type ICreateProductPayload = z.infer<
  typeof ProductValidation.createProduct
>['body'];

export type IProductFilters = { searchTerm?: string; isActive?: boolean };
```

**`product.service.ts`** — all the business logic and every Prisma call.

```ts
import { StatusCodes } from 'http-status-codes';

import ApiError from '../../../errors/ApiError';
import { type Prisma } from '../../../generated/prisma/client';
import { paginationHelpers } from '../../../helpers/paginationHelper';
import type { IPaginatedResult } from '../../../interfaces/common';
import type { IPaginationOptions } from '../../../interfaces/pagination';
import prisma from '../../../shared/prisma';

import { PRODUCT_SEARCHABLE_FIELDS, PRODUCT_SORTABLE_FIELDS } from './product.constant';
import type { ICreateProductPayload, IProductFilters } from './product.interface';

// One projection reused everywhere, so every endpoint returns the same shape
// and nothing sensitive can leak by accident.
const productSelect = {
  id: true,
  name: true,
  price: true,
  description: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.ProductSelect;

export type ProductResponse = Prisma.ProductGetPayload<{
  select: typeof productSelect;
}>;

const createProduct = async (
  payload: ICreateProductPayload,
): Promise<ProductResponse> =>
  prisma.product.create({ data: payload, select: productSelect });

const getAllProducts = async (
  filters: IProductFilters,
  options: IPaginationOptions,
): Promise<IPaginatedResult<ProductResponse>> => {
  const { page, limit, skip, sortBy, sortOrder } =
    paginationHelpers.calculatePagination(options, PRODUCT_SORTABLE_FIELDS);

  const { searchTerm, ...exact } = filters;
  const conditions: Prisma.ProductWhereInput[] = [];

  if (searchTerm) {
    conditions.push({
      OR: PRODUCT_SEARCHABLE_FIELDS.map((field) => ({
        [field]: { contains: searchTerm, mode: 'insensitive' },
      })),
    });
  }

  for (const [field, value] of Object.entries(exact)) {
    if (value !== undefined) conditions.push({ [field]: value });
  }

  const where: Prisma.ProductWhereInput =
    conditions.length > 0 ? { AND: conditions } : {};

  // Promise.all, not $transaction — see the note in §6.
  const [data, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: productSelect,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
    prisma.product.count({ where }),
  ]);

  return paginationHelpers.paginate(data, page, limit, total);
};

const getProductById = async (id: string): Promise<ProductResponse> => {
  const product = await prisma.product.findUnique({
    where: { id },
    select: productSelect,
  });

  if (!product) throw new ApiError(StatusCodes.NOT_FOUND, 'Product not found');

  return product;
};

export const ProductService = { createProduct, getAllProducts, getProductById };
```

**`product.controller.ts`** — thin on purpose. No logic, no Prisma.

```ts
import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

import { PAGINATION_FIELDS } from '../../../constants/pagination';
import catchAsync from '../../../shared/catchAsync';
import getQuery from '../../../shared/getQuery';
import pick from '../../../shared/pick';
import sendResponse from '../../../shared/sendResponse';

import { PRODUCT_FILTERABLE_FIELDS } from './product.constant';
import type { IProductFilters } from './product.interface';
import { ProductService } from './product.service';

const createProduct = catchAsync(async (req: Request, res: Response) => {
  const result = await ProductService.createProduct(req.body);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Product created successfully',
    data: result,
  });
});

const getAllProducts = catchAsync(async (req: Request, res: Response) => {
  const query = getQuery<Record<string, unknown>>(req);
  const filters = pick(query, PRODUCT_FILTERABLE_FIELDS) as IProductFilters;
  const options = pick(query, PAGINATION_FIELDS);

  const { meta, data } = await ProductService.getAllProducts(filters, options);

  sendResponse(res, { message: 'Products retrieved successfully', meta, data });
});

const getProductById = catchAsync(async (req: Request, res: Response) => {
  const result = await ProductService.getProductById(req.params.id as string);

  sendResponse(res, { message: 'Product retrieved successfully', data: result });
});

export const ProductController = {
  createProduct,
  getAllProducts,
  getProductById,
};
```

**`product.route.ts`**

```ts
import express from 'express';

import validateRequest from '../../middlewares/validateRequest';

import { ProductController } from './product.controller';
import { ProductValidation } from './product.validation';

const router = express.Router();

router.get(
  '/',
  validateRequest(ProductValidation.getProducts),
  ProductController.getAllProducts,
);

router.get(
  '/:id',
  validateRequest(ProductValidation.productIdParam),
  ProductController.getProductById,
);

router.post(
  '/',
  validateRequest(ProductValidation.createProduct),
  ProductController.createProduct,
);

export const ProductRoutes = router;
```

To require a login, add the guard before the validator:

```ts
import auth from '../../middlewares/auth';
import { Role } from '../../../generated/prisma/enums';

router.post('/', auth(), validateRequest(...), ProductController.createProduct);
router.delete('/:id', auth(Role.ADMIN), ..., ProductController.deleteProduct);
```

### 4. Register it in `src/app/routes/index.ts`

```ts
import { ProductRoutes } from '../modules/product/product.route';

const moduleRoutes: { path: string; route: Router }[] = [
  { path: '/health', route: HealthRoutes },
  { path: '/products', route: ProductRoutes },
];
```

That is the entire checklist. `GET|POST /api/v1/products` now works, with
validation, pagination, filtering, search and error handling already wired.

---

## 6. Prisma & Postgres — the parts that trip people up first

You have not used these before, so here is the mental model.

**Postgres** is the database server (running in Docker here). **Prisma** is the
tool you use to talk to it: you describe your tables in `schema.prisma`, and
Prisma generates a fully typed TypeScript client. Autocomplete knows your
columns; a typo is a compile error, not a 3 a.m. bug.

**The one rule:** `schema.prisma` is the source of truth. You never write
`CREATE TABLE` by hand. You edit the schema and run a migration.

### The commands, and when to use each

| Command               | What it does                                                                                            | When                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `npm run db:migrate`  | Diffs schema vs. DB, writes a `.sql` file into `prisma/migrations/`, applies it, regenerates the client | **Every schema change during development** |
| `npm run db:generate` | Regenerates the typed client only                                                                       | After `git pull` brought schema changes    |
| `npm run db:studio`   | Opens a spreadsheet-style DB browser at `localhost:5555`                                                | To eyeball or hand-edit rows               |
| `npm run db:sql "…"`  | Runs any SQL and prints a table — no psql or Docker needed                                              | Quick queries and diagnostics              |
| `npm run db:seed`     | Runs `prisma/seed.ts`                                                                                   | Fresh database                             |
| `npm run db:reset`    | **Drops everything**, replays all migrations, re-seeds                                                  | Local DB is a mess. Never in production    |
| `npm run db:push`     | Force-syncs schema without a migration file                                                             | Throwaway experiments only                 |
| `npm run db:deploy`   | Applies existing migrations without generating new ones                                                 | **Production / CI deploys**                |

`db:migrate` vs. `db:deploy` is the important pair: **`migrate` in development
writes migration files, `deploy` in production only replays them.** Commit
`prisma/migrations/` to git — that folder is the history of your database.

### Reading Prisma queries

```ts
// findMany  → SELECT many rows
const users = await prisma.user.findMany({
  where:   { isActive: true },               // WHERE
  select:  { id: true, name: true },         // only these columns come back
  orderBy: { createdAt: 'desc' },            // ORDER BY
  skip: 0, take: 10,                         // OFFSET / LIMIT  ← pagination
});

await prisma.user.findUnique({ where: { id } });   // null if missing
await prisma.user.create({ data: { … } });
await prisma.user.update({ where: { id }, data: { … } });
await prisma.user.delete({ where: { id } });
```

**Use `select`, not `include`, when returning data to clients.** `include`
returns every column of the related record — including a user's `password`
hash. `select` returns only what you name, so a leak becomes impossible rather
than merely unlikely.

**Prefer `Promise.all` over `prisma.$transaction([...])` for read-only pairs**
like a page plus its total count. A transaction must acquire a connection and
`BEGIN` within Prisma's 2-second `maxWait`, which a remote database or a
cold-starting Neon compute will blow through — surfacing as
`P2028 Unable to start a transaction in the given time`. Reserve transactions
for writes that genuinely must succeed or fail together.

### Things that will bite you at least once

- **"I changed the schema and TypeScript doesn't see it."** You skipped the
  migration. Run `npm run db:migrate`.
- **`P2002 Unique constraint failed`** — a duplicate on a `@unique` column. The
  API already turns this into a clean `409`.
- **`P2025 Record not found`** — `update`/`delete` on a row that isn't there.
  Returned as `404`.
- **Never `new PrismaClient()` in a module.** Always
  `import prisma from '../../../shared/prisma'`. Each client opens its own
  connection pool, and Postgres will run out.
- **Adding a required column to a table with rows** fails — Postgres has nothing
  to put in the existing rows. Either give it a `@default(...)` or make it `?`.

---

## 7. Connecting the Next.js frontend

```ts
// frontend/lib/api.ts
const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5001/api/v1';

type ApiResponse<T> = {
  success: boolean;
  statusCode: number;
  message: string;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  data: T;
  errorDetails?: { path: string; message: string }[];
};

export async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResponse<T>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    credentials: 'include',
  });

  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) throw json; // errorDetails is ready for your form
  return json;
}
```

Add `NEXT_PUBLIC_API_URL=http://localhost:5001/api/v1` to `frontend/.env.local`.
CORS already allows any `localhost` port in development; for production, list
your real domain in `CORS_ORIGINS`.

---

## 8. What is already handled for you

| Concern          | How                                                                  |
| ---------------- | -------------------------------------------------------------------- |
| Env safety       | `config/index.ts` validates every var with Zod and exits on failure  |
| Input validation | Zod schema per route; types are **inferred** from it, never retyped  |
| Error → HTTP     | One handler maps Zod / Prisma / JWT / `ApiError` to correct statuses |
| Security headers | `helmet`                                                             |
| CORS             | Origin allow-list, credentials enabled                               |
| Abuse            | `express-rate-limit`, configurable per env                           |
| Logging          | `pino` — pretty locally, JSON in production, secrets redacted        |
| Tracing          | `x-request-id` on every request and response                         |
| DB connections   | One shared `PrismaClient`, survives `tsx watch` reloads              |
| Shutdown         | `SIGINT`/`SIGTERM` drain in-flight requests, then close the pool     |
| Payload size     | 5 MB cap on JSON bodies                                              |
| Query safety     | `sortBy` is allow-listed; `limit` capped at 100                      |

---

## 9. Scripts

| Script                  | Purpose                              |
| ----------------------- | ------------------------------------ |
| `npm run dev`           | Dev server with hot reload           |
| `npm run build`         | Generate client + compile to `dist/` |
| `npm start`             | Run the compiled build               |
| `npm run typecheck`     | Type-check everything, emit nothing  |
| `npm run lint` / `:fix` | ESLint                               |
| `npm run format`        | Prettier                             |
| `npm run db:*`          | See the Prisma table above           |

---

## 10. Going to production

1. Provision Postgres — [Neon](https://neon.tech), Supabase and Railway all have
   free tiers. Put their connection string in `DATABASE_URL` (keep `sslmode=require`).
2. Generate real secrets:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
3. Set `NODE_ENV=production`, `CORS_ORIGINS=https://yourdomain.com`, and lower
   `RATE_LIMIT_MAX`.
4. Deploy with `npm run build && npm run db:deploy && npm start`.

Never run `db:migrate` or `db:reset` against production — `db:deploy` only.
