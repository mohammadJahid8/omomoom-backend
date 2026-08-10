-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "RestaurantStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "ClaimState" AS ENUM ('UNCLAIMED', 'PENDING', 'CLAIMED');

-- CreateEnum
CREATE TYPE "PriceTier" AS ENUM ('ONE', 'TWO', 'THREE', 'FOUR');

-- CreateEnum
CREATE TYPE "MichelinRating" AS ENUM ('SELECTED', 'BIB_GOURMAND', 'ONE_STAR', 'TWO_STARS', 'THREE_STARS');

-- CreateEnum
CREATE TYPE "TagType" AS ENUM ('CUISINE', 'DISH', 'DIETARY', 'FEATURE', 'OCCASION', 'DRINK', 'SERVICE', 'PARKING', 'VIBE', 'EDITORIAL');

-- CreateEnum
CREATE TYPE "PhotoRole" AS ENUM ('GALLERY', 'COVER', 'LOGO');

-- CreateEnum
CREATE TYPE "PhotoStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PhotoSource" AS ENUM ('IMPORT', 'TEAM', 'OWNER', 'USER');

-- CreateEnum
CREATE TYPE "PendingStatus" AS ENUM ('NONE', 'DRAFT', 'SUBMITTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'VERIFIED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "cities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "neighborhoods" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "neighborhoods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "type" "TagType" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "emoji" TEXT,
    "code" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_tags" (
    "restaurantId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "restaurant_tags_pkey" PRIMARY KEY ("restaurantId","tagId")
);

-- CreateTable
CREATE TABLE "restaurants" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "neighborhoodId" TEXT,
    "municipality" TEXT,
    "addressLine" TEXT,
    "postalCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "googleMapsUrl" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "websiteUrl" TEXT,
    "menuUrl" TEXT,
    "reservationUrl" TEXT,
    "socials" JSONB,
    "description" TEXT,
    "story" TEXT,
    "whatMakesSpecial" TEXT,
    "chefStory" TEXT,
    "yearEstablished" INTEGER,
    "subCuisine" TEXT,
    "signatureDishes" TEXT,
    "hoursText" TEXT,
    "priceTier" "PriceTier",
    "michelin" "MichelinRating",
    "status" "RestaurantStatus" NOT NULL DEFAULT 'DRAFT',
    "claimState" "ClaimState" NOT NULL DEFAULT 'UNCLAIMED',
    "coverPhotoId" TEXT,
    "logoId" TEXT,
    "ratingAverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "pendingChanges" JSONB,
    "pendingStatus" "PendingStatus" NOT NULL DEFAULT 'NONE',
    "pendingSubmittedAt" TIMESTAMP(3),
    "pendingSubmittedBy" TEXT,
    "pendingReviewNote" TEXT,
    "externalRef" TEXT,
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_hours" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "opensAt" TEXT NOT NULL,
    "closesAt" TEXT NOT NULL,
    "label" TEXT,

    CONSTRAINT "restaurant_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_photos" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "storageKey" TEXT,
    "url" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "blurhash" TEXT,
    "caption" TEXT,
    "role" "PhotoRole" NOT NULL DEFAULT 'GALLERY',
    "status" "PhotoStatus" NOT NULL DEFAULT 'APPROVED',
    "source" "PhotoSource" NOT NULL DEFAULT 'TEAM',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurant_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "avatarUrl" TEXT,
    "phone" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_claims" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "claimantRole" TEXT NOT NULL,
    "workEmail" TEXT NOT NULL,
    "mobilePhone" TEXT NOT NULL,
    "note" TEXT,
    "verificationMethod" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_owners" (
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurant_owners_pkey" PRIMARY KEY ("restaurantId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "cities_slug_key" ON "cities"("slug");

-- CreateIndex
CREATE INDEX "neighborhoods_cityId_isActive_idx" ON "neighborhoods"("cityId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "neighborhoods_cityId_slug_key" ON "neighborhoods"("cityId", "slug");

-- CreateIndex
CREATE INDEX "tags_type_isActive_sortOrder_idx" ON "tags"("type", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "tags_type_slug_key" ON "tags"("type", "slug");

-- CreateIndex
CREATE INDEX "restaurant_tags_tagId_idx" ON "restaurant_tags"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_coverPhotoId_key" ON "restaurants"("coverPhotoId");

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_logoId_key" ON "restaurants"("logoId");

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_externalRef_key" ON "restaurants"("externalRef");

-- CreateIndex
CREATE INDEX "restaurants_cityId_status_name_idx" ON "restaurants"("cityId", "status", "name");

-- CreateIndex
CREATE INDEX "restaurants_cityId_neighborhoodId_status_idx" ON "restaurants"("cityId", "neighborhoodId", "status");

-- CreateIndex
CREATE INDEX "restaurants_status_ratingAverage_idx" ON "restaurants"("status", "ratingAverage" DESC);

-- CreateIndex
CREATE INDEX "restaurants_claimState_idx" ON "restaurants"("claimState");

-- CreateIndex
CREATE INDEX "restaurants_pendingStatus_pendingSubmittedAt_idx" ON "restaurants"("pendingStatus", "pendingSubmittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_cityId_slug_key" ON "restaurants"("cityId", "slug");

-- CreateIndex
CREATE INDEX "restaurant_hours_restaurantId_dayOfWeek_idx" ON "restaurant_hours"("restaurantId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "restaurant_photos_restaurantId_status_sortOrder_idx" ON "restaurant_photos"("restaurantId", "status", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE INDEX "users_role_isActive_idx" ON "users"("role", "isActive");

-- CreateIndex
CREATE INDEX "restaurant_claims_status_createdAt_idx" ON "restaurant_claims"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_claims_restaurantId_userId_key" ON "restaurant_claims"("restaurantId", "userId");

-- CreateIndex
CREATE INDEX "restaurant_owners_userId_idx" ON "restaurant_owners"("userId");

-- AddForeignKey
ALTER TABLE "neighborhoods" ADD CONSTRAINT "neighborhoods_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_tags" ADD CONSTRAINT "restaurant_tags_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_tags" ADD CONSTRAINT "restaurant_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "neighborhoods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_coverPhotoId_fkey" FOREIGN KEY ("coverPhotoId") REFERENCES "restaurant_photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_logoId_fkey" FOREIGN KEY ("logoId") REFERENCES "restaurant_photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_hours" ADD CONSTRAINT "restaurant_hours_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_photos" ADD CONSTRAINT "restaurant_photos_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_photos" ADD CONSTRAINT "restaurant_photos_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_claims" ADD CONSTRAINT "restaurant_claims_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_claims" ADD CONSTRAINT "restaurant_claims_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_owners" ADD CONSTRAINT "restaurant_owners_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_owners" ADD CONSTRAINT "restaurant_owners_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
