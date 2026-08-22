import type Stripe from 'stripe';

import { SubscriptionStatus } from '../../../generated/prisma/enums';
import logger from '../../../shared/logger';
import prisma from '../../../shared/prisma';
import { stripe } from '../../../shared/stripe';

/**
 * Is this restaurant paid up right now?
 *
 * One definition, imported by everything that gates on money, so the Studio
 * and the billing page can never disagree about whether someone may edit.
 *
 * Cancelled and past due both keep working while the paid period runs. A
 * cancellation is honoured to the day it was bought to, and a failed renewal
 * is usually an expired card that Stripe will retry successfully, so locking
 * someone out on the first attempt punishes the wrong thing.
 */
export const isSubscriptionActive = (row: {
  subscriptionStatus: SubscriptionStatus;
  subscribedUntil: Date | null;
}): boolean => {
  if (row.subscriptionStatus === SubscriptionStatus.ACTIVE) return true;

  const within = Boolean(row.subscribedUntil && row.subscribedUntil > new Date());

  return (
    within &&
    (row.subscriptionStatus === SubscriptionStatus.CANCELLED ||
      row.subscriptionStatus === SubscriptionStatus.PAST_DUE)
  );
};

/**
 * Stripe's eight states, in our four.
 *
 * `cancel_at_period_end` is the interesting one: Stripe still calls that
 * subscription active, because it is, but the customer has told us they are
 * leaving. Recording it as CANCELLED is what lets the page offer "resume"
 * rather than "cancel" for the rest of the month.
 */
const statusOf = (subscription: Stripe.Subscription): SubscriptionStatus => {
  if (subscription.cancel_at_period_end && subscription.status === 'active') {
    return SubscriptionStatus.CANCELLED;
  }

  switch (subscription.status) {
    case 'active':
    case 'trialing':
      return SubscriptionStatus.ACTIVE;
    case 'past_due':
    case 'unpaid':
    case 'paused':
      return SubscriptionStatus.PAST_DUE;
    case 'canceled':
      return SubscriptionStatus.CANCELLED;
    default:
      // incomplete, incomplete_expired: checkout never finished paying.
      return SubscriptionStatus.NONE;
  }
};

/**
 * Paid through when, not "when would the period have ended".
 *
 * A subscription cancelled outright still carries a future period end, so
 * reading that would keep someone editing a listing they no longer pay for.
 * When Stripe says it has ended, the moment it ended is the answer.
 */
const paidThrough = (subscription: Stripe.Subscription): Date | null => {
  if (subscription.ended_at) return new Date(subscription.ended_at * 1000);

  const item = subscription.items.data[0];
  const seconds = item?.current_period_end ?? subscription.cancel_at ?? null;
  return seconds ? new Date(seconds * 1000) : null;
};

/** Which listing this subscription pays for. */
async function restaurantIdFor(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const tagged = subscription.metadata?.restaurantId;
  if (tagged) return tagged;

  // Older subscriptions, or ones created outside this app, can still be
  // matched by the reference we stored when they started.
  const row = await prisma.restaurant.findFirst({
    where: { subscriptionRef: subscription.id },
    select: { id: true },
  });

  return row?.id ?? null;
}

/**
 * Reads the subscription back from Stripe and writes what it says.
 *
 * Deliberately not trusting the webhook payload. Events can arrive out of
 * order, and an older one overwriting a newer one is the kind of bug that
 * shows up as a customer being locked out for no reason. Asking Stripe for
 * the current state makes ordering irrelevant.
 */
export const syncFromStripe = async (subscriptionId: string): Promise<void> => {
  if (!stripe) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const restaurantId = await restaurantIdFor(subscription);

  if (!restaurantId) {
    logger.warn(
      { subscriptionId },
      'Stripe subscription has no restaurant to apply to',
    );
    return;
  }

  const status = statusOf(subscription);
  const until = paidThrough(subscription);

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: {
      subscriptionStatus: status,
      subscribedUntil: until,
      subscriptionRef: subscription.id,
      // Set once, on the first payment, so "started" means what it says even
      // after a cancel and restart.
      ...(subscription.start_date
        ? { subscribedAt: new Date(subscription.start_date * 1000) }
        : {}),
    },
  });

  logger.info(
    {
      restaurantId,
      subscriptionId,
      stripeStatus: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      status,
      until,
    },
    'Subscription synced from Stripe',
  );
};
