/**
 * Drives a real subscription through its whole life in Stripe test mode.
 *
 *   npm run stripe:lifecycle
 *
 * Nothing here is a mock: it pays with a test card, then cancels, resumes and
 * lets the renewal fail, checking what the app believes after each step.
 */
import config from '../config';
import prisma from '../shared/prisma';
import { stripe } from '../shared/stripe';
import {
  isSubscriptionActive,
  syncFromStripe,
} from '../app/modules/subscription/subscription.sync';

const SLUG = 'azabu-miami-beach';

async function state(label: string) {
  const r = await prisma.restaurant.findFirstOrThrow({
    where: { slug: SLUG },
    select: { subscriptionStatus: true, subscribedUntil: true, subscriptionRef: true },
  });
  console.log(
    `  ${label.padEnd(26)} ${r.subscriptionStatus.padEnd(9)} active=${String(
      isSubscriptionActive(r),
    ).padEnd(5)} until=${r.subscribedUntil?.toISOString().slice(0, 10) ?? '-'}`,
  );
  return r;
}

async function main() {
  const restaurant = await prisma.restaurant.findFirstOrThrow({
    where: { slug: SLUG },
    select: { id: true, name: true },
  });

  // A customer with a working test card already attached, so this can pay
  // without driving a browser through Stripe's hosted page.
  const method = await stripe!.paymentMethods.create({
    type: 'card',
    card: { token: 'tok_visa' },
  });

  const customer = await stripe!.customers.create({
    name: 'Lifecycle probe',
    payment_method: method.id,
    invoice_settings: { default_payment_method: method.id },
  });

  const subscription = await stripe!.subscriptions.create({
    customer: customer.id,
    items: [{ price: config.stripe.priceId }],
    metadata: { restaurantId: restaurant.id },
  });

  console.log(`\n  subscription ${subscription.id} (${subscription.status})\n`);

  await syncFromStripe(subscription.id);
  await state('after first payment');

  await stripe!.subscriptions.update(subscription.id, { cancel_at_period_end: true });
  await syncFromStripe(subscription.id);
  await state('after cancel');

  await stripe!.subscriptions.update(subscription.id, { cancel_at_period_end: false });
  await syncFromStripe(subscription.id);
  await state('after resume');

  await stripe!.subscriptions.cancel(subscription.id);
  await syncFromStripe(subscription.id);
  await state('after ending it');

  await stripe!.customers.del(customer.id);
  await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: {
      subscriptionStatus: 'NONE',
      subscribedAt: null,
      subscribedUntil: null,
      subscriptionRef: null,
    },
  });
  console.log('\n  cleaned up');
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
