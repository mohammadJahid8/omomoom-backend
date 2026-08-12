import { StatusCodes } from 'http-status-codes';

import ApiError from '../../../errors/ApiError';
import {
  RecommendationStatus,
  RestaurantStatus,
} from '../../../generated/prisma/enums';
import prisma from '../../../shared/prisma';
import { isAdmin } from '../../middlewares/auth';
import type { SessionUser } from '../../../shared/session';

import type {
  CreateRecommendationBody,
  ListForRestaurantQuery,
  ListRecentQuery,
} from './recommendation.validation';

const publicSelect = {
  id: true,
  dish: true,
  rating: true,
  comment: true,
  photoUrl: true,
  createdAt: true,
  user: { select: { username: true, name: true, avatarUrl: true } },
} as const;

const withRestaurant = {
  ...publicSelect,
  restaurant: {
    select: {
      slug: true,
      name: true,
      neighborhood: { select: { name: true } },
      municipality: true,
      coverPhoto: { select: { url: true, blurhash: true } },
    },
  },
} as const;

const blankToNull = (value: unknown) =>
  value === '' || value === undefined ? null : (value as string | null);

/**
 * Restaurant.ratingAverage and reviewCount are denormalised so list queries
 * never aggregate. Recompute them from the published rows after every write,
 * rather than nudging a running total that drifts the first time a row is
 * hidden or deleted.
 */
async function refreshRestaurantRating(restaurantId: string): Promise<void> {
  const result = await prisma.recommendation.aggregate({
    where: { restaurantId, status: RecommendationStatus.PUBLISHED },
    _avg: { rating: true },
    _count: { _all: true },
  });

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: {
      ratingAverage: Number((result._avg.rating ?? 0).toFixed(2)),
      reviewCount: result._count._all,
    },
  });
}

const create = async (userId: string, input: CreateRecommendationBody) => {
  const restaurant = await prisma.restaurant.findFirst({
    where: { id: input.restaurantId, status: RestaurantStatus.PUBLISHED },
    select: { id: true },
  });

  if (!restaurant) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  }

  const created = await prisma.recommendation.create({
    data: {
      userId,
      restaurantId: input.restaurantId,
      dish: input.dish,
      rating: input.rating,
      comment: blankToNull(input.comment),
      photoUrl: blankToNull(input.photoUrl),
    },
    select: publicSelect,
  });

  await refreshRestaurantRating(input.restaurantId);

  return created;
};

const remove = async (user: SessionUser, id: string) => {
  const existing = await prisma.recommendation.findUnique({
    where: { id },
    select: { id: true, userId: true, restaurantId: true },
  });

  if (!existing) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Recommendation not found');
  }

  if (existing.userId !== user.id && !isAdmin(user.role)) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      'You can only remove your own recommendations',
    );
  }

  await prisma.recommendation.delete({ where: { id } });
  await refreshRestaurantRating(existing.restaurantId);
};

const listForRestaurant = async (query: ListForRestaurantQuery) =>
  prisma.recommendation.findMany({
    where: {
      restaurantId: query.restaurantId,
      status: RecommendationStatus.PUBLISHED,
    },
    orderBy: { createdAt: 'desc' },
    take: query.limit,
    select: publicSelect,
  });

const listRecent = async (query: ListRecentQuery) =>
  prisma.recommendation.findMany({
    where: {
      status: RecommendationStatus.PUBLISHED,
      restaurant: { status: RestaurantStatus.PUBLISHED },
    },
    orderBy: { createdAt: 'desc' },
    take: query.limit,
    select: withRestaurant,
  });

const listForUser = async (userId: string) =>
  prisma.recommendation.findMany({
    where: { userId, status: RecommendationStatus.PUBLISHED },
    orderBy: { createdAt: 'desc' },
    select: withRestaurant,
  });

/**
 * The four numbers on a profile. Places tried counts distinct restaurants, not
 * recommendations, since one person can recommend two dishes at one place.
 */
const statsForUser = async (userId: string) => {
  const [recommendations, withPhoto, restaurants, saves] = await Promise.all([
    prisma.recommendation.count({
      where: { userId, status: RecommendationStatus.PUBLISHED },
    }),
    prisma.recommendation.count({
      where: {
        userId,
        status: RecommendationStatus.PUBLISHED,
        photoUrl: { not: null },
      },
    }),
    prisma.recommendation.findMany({
      where: { userId, status: RecommendationStatus.PUBLISHED },
      distinct: ['restaurantId'],
      select: { restaurantId: true },
    }),
    prisma.savedRestaurant.count({ where: { userId } }),
  ]);

  return {
    recommendations,
    photos: withPhoto,
    placesTried: restaurants.length,
    wantToTry: saves,
  };
};

export const RecommendationService = {
  create,
  remove,
  listForRestaurant,
  listRecent,
  listForUser,
  statsForUser,
};
