import { StatusCodes } from 'http-status-codes';

import config from '../../../config';
import ApiError from '../../../errors/ApiError';
import {
  ClaimState,
  SubscriptionStatus,
} from '../../../generated/prisma/enums';
import prisma from '../../../shared/prisma';
import { isSubscriptionActive, syncFromStripe } from './subscription.sync';
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
  active: isSubscriptionActive(row),
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
    userId: user.id,
    userEmail: user.email,
  });

  // Nothing is marked paid here. Stripe takes the card on its own page and
  // tells us afterwards, so the only honest answer now is where to send them.
  if (started.kind === 'redirect') {
    return { checkoutUrl: started.url, subscription: shape(restaurant) };
  }

  return {
    checkoutUrl: null,
    subscription: shape(
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
    ),
  };
};

/** Stripe's own page for cards and invoices. Cancelling stays in our UI. */
const billingPortal = async (user: SessionUser, restaurantId: string) => {
  await requireOwnership(user, restaurantId);

  const url = await paymentProvider.billingPortal({
    userId: user.id,
    returnUrl: `${config.appUrl}/dashboard/restaurant/subscription`,
  });

  if (!url) {
    throw new ApiError(
      StatusCodes.SERVICE_UNAVAILABLE,
      'There is no billing account to manage yet',
    );
  }

  return { url };
};

/**
 * Reads back what the provider now says rather than assuming the write landed
 * as asked. The webhook will say the same thing a second later, but the person
 * who just clicked needs an answer now, and it should be the true one.
 */
async function afterProviderChange(
  restaurantId: string,
  reference: string | null,
  fallback: SubscriptionStatus,
) {
  if (paymentProvider.mocked || !reference) {
    return shape(
      await prisma.restaurant.update({
        where: { id: restaurantId },
        data: { subscriptionStatus: fallback },
        select: stateSelect,
      }),
    );
  }

  await syncFromStripe(reference);

  const fresh = await prisma.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: stateSelect,
  });

  return shape(fresh);
}

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
  return afterProviderChange(
    restaurantId,
    restaurant.subscriptionRef,
    SubscriptionStatus.CANCELLED,
  );
};

/**
 * Changing your mind before the period runs out. Nothing is charged: that month
 * is already paid for, so this only clears the pending cancellation.
 */
const resume = async (user: SessionUser, restaurantId: string) => {
  const restaurant = await requireOwnership(user, restaurantId);

  if (restaurant.subscriptionStatus !== SubscriptionStatus.CANCELLED) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      'That subscription is not cancelled',
    );
  }

  if (!shape(restaurant).active) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      'That period has already run out. Start it again instead.',
    );
  }

  await paymentProvider.resume(restaurant.subscriptionRef);

  return afterProviderChange(
    restaurantId,
    restaurant.subscriptionRef,
    SubscriptionStatus.ACTIVE,
  );
};

export const SubscriptionService = {
  statusFor,
  start,
  cancel,
  resume,
  billingPortal,
};
