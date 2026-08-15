-- AlterTable
ALTER TABLE "restaurant_claims" ADD COLUMN     "codeAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "codeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "codeHash" TEXT,
ADD COLUMN     "codeSentTo" TEXT;
