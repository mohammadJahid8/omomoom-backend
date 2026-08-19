-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('NONE', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "subscribedAt" TIMESTAMP(3),
ADD COLUMN     "subscribedUntil" TIMESTAMP(3),
ADD COLUMN     "subscriptionRef" TEXT,
ADD COLUMN     "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'NONE';
