import { StatusCodes } from 'http-status-codes';

import ApiError from '../../../errors/ApiError';
import {
  ClaimState,
  SubscriptionStatus,
} from '../../../generated/prisma/enums';
import prisma from '../../../shared/prisma';
import type { SessionUser } from '../../../shared/session';
import { isAdmin } from '../../middlewares/auth';

import {
  CURRENCY,
  PRICE_CENTS,
  paymentProvider,
} from './subscription.provider';

const stateSelect = {
  id: true,
  slug: true,
  name: true,
  claimState: true,
  subscriptionStatus: true,
  subscribedAt: true,
  subscribedUntil: true,
} as const;

const shape = (row: {
  id: string;
  slug: string;
  name: string;
  claimState: ClaimState;
  subscriptionStatus: SubscriptionStatus;
  subscribedAt: Date | null;
  subscribedUntil: Date | null;
}) => ({
  ...row,
  priceCents: PRICE_CENTS,
  currency: CURRENCY,
  mocked: paymentProvider.mocked,
  /**
   * Cancelling leaves the Studio open until the paid period runs out, so the
   * gate asks "is it still paid for", not "is the status ACTIVE".
   */
  active:
    row.subscriptionStatus === SubscriptionStatus.ACTIVE ||
    (row.subscriptionStatus === SubscriptionStatus.CANCELLED &&
      Boolean(row.subscribedUntil && row.subscribedUntil > new Date())),
});

async function requireOwnership(user: SessionUser, restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { ...stateSelect, subscriptionRef: true },
  });

  if (!restaurant) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  }

  const owns = user.ownedRestaurantIds.includes(restaurantId);
  if (!owns && !isAdmin(user.role)) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      'Verify your connection to this restaurant first',
    );
  }

  return restaurant;
}

const statusFor = async (user: SessionUser, restaurantId: string) =>
  shape(await requireOwnership(user, restaurantId));

const start = async (user: SessionUser, restaurantId: string) => {
  const restaurant = await requireOwnership(user, restaurantId);

  if (restaurant.claimState !== ClaimState.CLAIMED) {
    throw new ApiError(
      StatusCodes.UNPROCESSABLE_ENTITY,
      'This restaurant has not been claimed yet',
    );
  }

  if (shape(restaurant).active) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      'This restaurant is already subscribed',
    );
  }

  const started = await paymentProvider.start({
    restaurantId,
    restaurantName: restaurant.name,
    userEmail: user.email,
  });

  return shape(
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscribedAt: new Date(),
        subscribedUntil: started.paidUntil,
        subscriptionRef: started.reference,
      },
      select: stateSelect,
    }),
  );
};

const cancel = async (user: SessionUser, restaurantId: string) => {
  const restaurant = await requireOwnership(user, restaurantId);

  if (!shape(restaurant).active) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      'There is no active subscription to cancel',
    );
  }

  await paymentProvider.cancel(restaurant.subscriptionRef);

  // The paid period is honoured; only the renewal stops.
  return shape(
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { subscriptionStatus: SubscriptionStatus.CANCELLED },
      select: stateSelect,
    }),
  );
};

export const SubscriptionService = { statusFor, start, cancel };
