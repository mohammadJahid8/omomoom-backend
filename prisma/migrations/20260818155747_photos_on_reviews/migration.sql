/*
  Warnings:

  - You are about to drop the column `photoUrl` on the `recommendations` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "recommendations" DROP COLUMN "photoUrl";

-- AlterTable
ALTER TABLE "restaurant_photos" ADD COLUMN     "recommendationId" TEXT;

-- CreateIndex
CREATE INDEX "restaurant_photos_recommendationId_idx" ON "restaurant_photos"("recommendationId");

-- AddForeignKey
ALTER TABLE "restaurant_photos" ADD CONSTRAINT "restaurant_photos_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
