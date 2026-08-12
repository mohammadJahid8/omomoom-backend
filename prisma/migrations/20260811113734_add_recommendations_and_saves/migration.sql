-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PUBLISHED', 'HIDDEN');

-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "dish" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "photoUrl" TEXT,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_restaurants" (
    "userId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_restaurants_pkey" PRIMARY KEY ("userId","restaurantId")
);

-- CreateIndex
CREATE INDEX "recommendations_restaurantId_status_createdAt_idx" ON "recommendations"("restaurantId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "recommendations_userId_createdAt_idx" ON "recommendations"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "saved_restaurants_userId_createdAt_idx" ON "saved_restaurants"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "saved_restaurants_restaurantId_idx" ON "saved_restaurants"("restaurantId");

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_restaurants" ADD CONSTRAINT "saved_restaurants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_restaurants" ADD CONSTRAINT "saved_restaurants_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
