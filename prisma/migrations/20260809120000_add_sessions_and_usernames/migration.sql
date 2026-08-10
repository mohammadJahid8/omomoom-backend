-- Password sign-in throttling state.
ALTER TABLE "users" ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lockedUntil" TIMESTAMP(3);

-- Username is required, but existing rows have none. Add it nullable, derive one
-- from the email local part, then lock the column down.
ALTER TABLE "users" ADD COLUMN "username" TEXT;

UPDATE "users" AS u
SET "username" = c.candidate
FROM (
  SELECT
    id,
    CASE WHEN rn = 1 THEN slug ELSE slug || rn::text END AS candidate
  FROM (
    SELECT
      id,
      slug,
      row_number() OVER (PARTITION BY slug ORDER BY "createdAt", id) AS rn
    FROM (
      SELECT
        id,
        "createdAt",
        NULLIF(
          trim(both '-' from regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9]+', '-', 'g')),
          ''
        ) AS slug
      FROM "users"
    ) AS slugged
    WHERE slug IS NOT NULL
  ) AS ranked
) AS c
WHERE u.id = c.id;

-- Anything whose email produced no usable slug falls back to its id.
UPDATE "users"
SET "username" = 'user-' || left(replace(id, '-', ''), 10)
WHERE "username" IS NULL;

ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
