import { StatusCodes } from 'http-status-codes';

import ApiError from '../../../errors/ApiError';
import {
  PhotoSource,
  PhotoStatus,
  RecommendationStatus,
  RestaurantStatus,
} from '../../../generated/prisma/enums';
import prisma from '../../../shared/prisma';
import { cardSelect, shapeCard } from '../restaurant/restaurant.service';

/** Enough to fill a profile without turning one page into a full export. */
const LIMITS = { reviews: 24, photos: 24, restaurants: 18 } as const;

const reviewSelect = {
  id: true,
  dish: true,
  rating: true,
  comment: true,
  wouldOrderAgain: true,
  visitScore: true,
  aiSummary: true,
  createdAt: true,
  photos: {
    where: { status: PhotoStatus.APPROVED },
    orderBy: { createdAt: 'asc' },
    select: { id: true, url: true, caption: true, width: true, height: true },
  },
  restaurant: {
    select: { id: true, slug: true, name: true, neighborhood: { select: { name: true } } },
  },
} as const;

/**
 * Someone's food identity: what they contributed as a diner. Photos an owner
 * uploaded through the Studio belong to the listing, not to them, so they are
 * left out. Published work only, and no profile at all for a disabled account.
 */
const publicProfile = async (username: string) => {
  const user = await prisma.user.findFirst({
    where: { username: username.toLowerCase(), isActive: true },
    select: {
      id: true,
      username: true,
      name: true,
      avatarUrl: true,
      createdAt: true,
    },
  });

  if (!user) throw new ApiError(StatusCodes.NOT_FOUND, 'Profile not found');

  const published = {
    userId: user.id,
    status: RecommendationStatus.PUBLISHED,
  } as const;

  const [reviews, photos, tried, saved, counts] = await Promise.all([
    prisma.recommendation.findMany({
      where: published,
      orderBy: { createdAt: 'desc' },
      take: LIMITS.reviews,
      select: reviewSelect,
    }),

    prisma.restaurantPhoto.findMany({
      where: {
        uploadedById: user.id,
        source: PhotoSource.USER,
        status: PhotoStatus.APPROVED,
      },
      orderBy: { createdAt: 'desc' },
      take: LIMITS.photos,
      select: {
        id: true,
        url: true,
        caption: true,
        width: true,
        height: true,
        restaurant: { select: { slug: true, name: true } },
      },
    }),

    prisma.recommendation.findMany({
      where: { ...published, restaurant: { status: RestaurantStatus.PUBLISHED } },
      distinct: ['restaurantId'],
      orderBy: { createdAt: 'desc' },
      take: LIMITS.restaurants,
      select: { restaurant: { select: cardSelect } },
    }),

    prisma.savedRestaurant.findMany({
      where: {
        userId: user.id,
        restaurant: { status: RestaurantStatus.PUBLISHED },
      },
      orderBy: { createdAt: 'desc' },
      take: LIMITS.restaurants,
      select: { restaurant: { select: cardSelect } },
    }),

    Promise.all([
      prisma.recommendation.count({ where: published }),
      prisma.restaurantPhoto.count({
        where: {
          uploadedById: user.id,
          source: PhotoSource.USER,
          status: PhotoStatus.APPROVED,
        },
      }),
      prisma.recommendation
        .findMany({ where: published, distinct: ['restaurantId'], select: { restaurantId: true } })
        .then((rows) => rows.length),
      prisma.savedRestaurant.count({ where: { userId: user.id } }),
    ]),
  ]);

  const [reviewCount, photoCount, triedCount, savedCount] = counts;

  return {
    user: {
      username: user.username,
      name: user.name,
      avatarUrl: user.avatarUrl,
      joinedAt: user.createdAt,
    },
    counts: {
      reviews: reviewCount,
      photos: photoCount,
      placesTried: triedCount,
      wantToTry: savedCount,
    },
    reviews,
    photos,
    placesTried: tried.map((row) => shapeCard(row.restaurant)),
    wantToTry: saved.map((row) => shapeCard(row.restaurant)),
  };
};

export const UserProfileService = { publicProfile };
