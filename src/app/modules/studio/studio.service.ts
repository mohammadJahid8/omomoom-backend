import { StatusCodes } from 'http-status-codes';

import ApiError from '../../../errors/ApiError';
import type { Prisma } from '../../../generated/prisma/client';
import { type SubscriptionStatus } from '../../../generated/prisma/enums';
import prisma from '../../../shared/prisma';
import { isSubscriptionActive } from '../subscription/subscription.sync';
import type { SessionUser } from '../../../shared/session';
import { isAdmin } from '../../middlewares/auth';

import type { StudioUpdateBody } from './studio.validation';

const studioSelect = {
  id: true,
  slug: true,
  name: true,
  status: true,
  claimState: true,

  hoursText: true,
  phone: true,
  email: true,
  addressLine: true,
  municipality: true,
  websiteUrl: true,
  menuUrl: true,
  reservationUrl: true,

  signatureDishes: true,
  description: true,
  story: true,
  chefStory: true,
  whatMakesSpecial: true,

  subCuisine: true,
  priceTier: true,
  michelin: true,

  subscriptionStatus: true,
  subscribedUntil: true,

  ratingAverage: true,
  reviewCount: true,
  neighborhood: { select: { name: true } },
  coverPhoto: { select: { url: true } },
  _count: { select: { recommendations: true, photos: true } },
  updatedAt: true,
} as const;

const shape = <T extends { subscriptionStatus: SubscriptionStatus; subscribedUntil: Date | null }>(
  row: T,
) => ({ ...row, subscriptionActive: isSubscriptionActive(row) });

const get = async (restaurantId: string) => {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: studioSelect,
  });

  if (!restaurant) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  }

  return shape(restaurant);
};

const blank = (value: unknown) =>
  value === '' || value === null ? null : (value as string);

/**
 * The paywall, in one place, for every write the Studio makes. Admins pass:
 * they are curating the site, not buying a listing, and a restaurant with no
 * subscription still needs someone able to fix it.
 */
export const assertPaid = async (restaurantId: string, actor: SessionUser) => {
  if (isAdmin(actor.role)) return;

  const existing = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, subscriptionStatus: true, subscribedUntil: true },
  });

  if (!existing) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  }

  if (!isSubscriptionActive(existing)) {
    throw new ApiError(
      StatusCodes.PAYMENT_REQUIRED,
      'Start your subscription to edit this listing',
    );
  }
};

const update = async (
  restaurantId: string,
  input: StudioUpdateBody,
  actor: SessionUser,
) => {
  await assertPaid(restaurantId, actor);

  const data: Prisma.RestaurantUncheckedUpdateInput = {};

  const fields = [
    'hoursText',
    'phone',
    'email',
    'addressLine',
    'websiteUrl',
    'menuUrl',
    'reservationUrl',
    'signatureDishes',
    'description',
    'story',
    'chefStory',
    'whatMakesSpecial',
    'subCuisine',
  ] as const;

  for (const field of fields) {
    if (input[field] !== undefined) data[field] = blank(input[field]);
  }

  if (input.priceTier !== undefined) {
    data.priceTier = blank(input.priceTier) as never;
  }

  return shape(
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data,
      select: studioSelect,
    }),
  );
};

export const StudioService = { get, update };
