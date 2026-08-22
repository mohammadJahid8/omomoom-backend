import { StatusCodes } from 'http-status-codes';

import ApiError from '../../../errors/ApiError';
import {
  PhotoRole,
  PhotoSource,
  PhotoStatus,
  RecommendationStatus,
  RestaurantStatus,
  TagType,
} from '../../../generated/prisma/enums';
import prisma from '../../../shared/prisma';
import { describeObject, publicUrlFor } from '../../../shared/storage';
import { MAX_PENDING_PER_USER } from '../upload/upload.service';
import { isAdmin } from '../../middlewares/auth';
import type { SessionUser } from '../../../shared/session';

import { summarise, visitScore } from './recommendation.scoring';

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
  photos: {
    where: { status: PhotoStatus.APPROVED },
    orderBy: { createdAt: 'asc' },
    select: { id: true, url: true, caption: true, width: true, height: true },
  },
  wouldOrderAgain: true,
  taste: true,
  service: true,
  value: true,
  ambience: true,
  hygiene: true,
  visitScore: true,
  aiSummary: true,
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
    select: { id: true, name: true },
  });

  if (!restaurant) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  }

  const ratings = {
    taste: input.taste ?? null,
    service: input.service ?? null,
    value: input.value ?? null,
    ambience: input.ambience ?? null,
    hygiene: input.hygiene ?? null,
  };

  const comment = blankToNull(input.comment);

  const aiSummary = await summarise({
    restaurantName: restaurant.name,
    dish: input.dish,
    rating: input.rating,
    comment,
    ratings,
  });

  /**
   * Only keys we handed to this person for this restaurant, and only ones the
   * upload actually completed. Anything else is dropped rather than refused:
   * a failed photo should not cost someone the review they just wrote.
   */
  const seen = new Set<string>();
  const offered = (input.photos ?? []).filter((photo) => {
    if (seen.has(photo.key)) return false;
    seen.add(photo.key);
    return photo.key.startsWith(`community/${input.restaurantId}/`);
  });

  const waiting = await prisma.restaurantPhoto.count({
    where: { uploadedById: userId, status: PhotoStatus.PENDING },
  });

  const room = Math.max(0, MAX_PENDING_PER_USER - waiting);

  const real = (
    await Promise.all(
      offered
        .slice(0, room)
        .map(async (photo) => ((await describeObject(photo.key)) ? photo : null)),
    )
  ).filter((photo): photo is (typeof offered)[number] => photo !== null);

  const created = await prisma.recommendation.create({
    data: {
      userId,
      restaurantId: input.restaurantId,
      dish: input.dish,
      rating: input.rating,
      comment,
      wouldOrderAgain: input.wouldOrderAgain ?? null,
      ...ratings,
      visitScore: visitScore(ratings),
      aiSummary,
      photos: {
        create: real.map((photo) => ({
          restaurantId: input.restaurantId,
          storageKey: photo.key,
          url: publicUrlFor(photo.key),
          width: photo.width ?? null,
          height: photo.height ?? null,
          role: PhotoRole.GALLERY,
          // Published reviews carry unpublished photos: the words are useful
          // straight away, the pictures are the part that needs a human.
          status: PhotoStatus.PENDING,
          source: PhotoSource.USER,
          uploadedById: userId,
          sortOrder: 1000,
        })),
      },
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
      restaurant: {
        status: RestaurantStatus.PUBLISHED,
        ...(query.cuisine?.length
          ? {
              tags: {
                some: { tag: { type: TagType.CUISINE, slug: { in: query.cuisine } } },
              },
            }
          : {}),
      },
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
    // Photos are their own contribution now, not a field on a review.
    // Rejected ones are left out; the person can still see them on their tab.
    prisma.restaurantPhoto.count({
      where: {
        uploadedById: userId,
        source: PhotoSource.USER,
        status: { in: [PhotoStatus.PENDING, PhotoStatus.APPROVED] },
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
