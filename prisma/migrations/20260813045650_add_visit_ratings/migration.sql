-- CreateEnum
CREATE TYPE "OrderAgain" AS ENUM ('DEFINITELY', 'MAYBE', 'NO');

-- AlterTable
ALTER TABLE "recommendations" ADD COLUMN     "aiSummary" TEXT,
ADD COLUMN     "ambience" INTEGER,
ADD COLUMN     "hygiene" INTEGER,
ADD COLUMN     "service" INTEGER,
ADD COLUMN     "taste" INTEGER,
ADD COLUMN     "value" INTEGER,
ADD COLUMN     "visitScore" DOUBLE PRECISION,
ADD COLUMN     "wouldOrderAgain" "OrderAgain";
