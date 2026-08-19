import { StatusCodes } from 'http-status-codes';

import ApiError from '../../../errors/ApiError';
import type { Prisma } from '../../../generated/prisma/client';
import { SubscriptionStatus } from '../../../generated/prisma/enums';
import prisma from '../../../shared/prisma';

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

const isPaid = (row: {
  subscriptionStatus: SubscriptionStatus;
  subscribedUntil: Date | null;
}) =>
  row.subscriptionStatus === SubscriptionStatus.ACTIVE ||
  (row.subscriptionStatus === SubscriptionStatus.CANCELLED &&
    Boolean(row.subscribedUntil && row.subscribedUntil > new Date()));

const shape = <T extends { subscriptionStatus: SubscriptionStatus; subscribedUntil: Date | null }>(
  row: T,
) => ({ ...row, subscriptionActive: isPaid(row) });

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

/** The paywall, in one place, for every write the Studio makes. */
export const assertPaid = async (restaurantId: string) => {
  const existing = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, subscriptionStatus: true, subscribedUntil: true },
  });

  if (!existing) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  }

  if (!isPaid(existing)) {
    throw new ApiError(
      StatusCodes.PAYMENT_REQUIRED,
      'Start your subscription to edit this listing',
    );
  }
};

const update = async (restaurantId: string, input: StudioUpdateBody) => {
  await assertPaid(restaurantId);

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
