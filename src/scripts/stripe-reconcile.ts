/**
 * Compares what we believe about every subscription against what Stripe says.
 *
 *   npm run stripe:reconcile            report drift
 *   npm run stripe:reconcile -- --apply fix it
 *
 * Webhook delivery is at-least-once, not exactly-once. A dropped event, a
 * deploy mid-delivery, or a handler that threw all leave the same mark: local
 * state that quietly disagrees with Stripe. Nothing in the app can notice,
 * because the evidence is an absence. This is what notices.
 *
 * Worth running on a schedule once live.
 */
import config from '../config';
import prisma from '../shared/prisma';
import { stripe } from '../shared/stripe';
import {
  isSubscriptionActive,
  syncFromStripe,
} from '../app/modules/subscription/subscription.sync';

type Drift = {
  restaurant: string;
  name: string;
  ours: string;
  theirs: string;
  reason: string;
};

async function main() {
  const apply = process.argv.includes('--apply');

  if (!stripe) {
    console.error('Stripe is not configured.');
    process.exit(1);
  }

  console.log(`Mode: ${config.stripe.testMode ? 'TEST' : 'LIVE'}\n`);

  const drift: Drift[] = [];

  // Everything we think is billing, checked against Stripe.
  const ours = await prisma.restaurant.findMany({
    where: { subscriptionRef: { not: null } },
    select: {
      id: true,
      name: true,
      subscriptionRef: true,
      subscriptionStatus: true,
      subscribedUntil: true,
    },
  });

  for (const row of ours) {
    const reference = row.subscriptionRef!;

    // A mock reference predates Stripe and will never resolve there. Nobody
    // ever paid for it, so leaving it ACTIVE is free access granted by
    // accident rather than a subscription worth honouring.
    if (!reference.startsWith('sub_')) {
      drift.push({
        restaurant: row.id,
        name: row.name,
        ours: row.subscriptionStatus,
        theirs: 'not a Stripe subscription',
        reason: 'left over from the mock provider, nothing was ever charged',
      });

      if (apply) {
        await prisma.restaurant.update({
          where: { id: row.id },
          data: {
            subscriptionStatus: 'NONE',
            subscribedAt: null,
            subscribedUntil: null,
            subscriptionRef: null,
          },
        });
      }
      continue;
    }

    try {
      const subscription = await stripe.subscriptions.retrieve(reference);
      const active = isSubscriptionActive(row);
      const theirsActive = ['active', 'trialing', 'past_due'].includes(
        subscription.status,
      );

      if (active !== theirsActive) {
        drift.push({
          restaurant: row.id,
          name: row.name,
          ours: `${row.subscriptionStatus} (active=${active})`,
          theirs: subscription.status,
          reason: 'access disagrees',
        });
        if (apply) await syncFromStripe(reference);
      }
    } catch {
      drift.push({
        restaurant: row.id,
        name: row.name,
        ours: row.subscriptionStatus,
        theirs: 'gone',
        reason: 'Stripe has no such subscription',
      });
    }
  }

  // And the other direction: anything live at Stripe that we are not tracking.
  // This is what a lost `checkout.session.completed` looks like, and it is the
  // expensive one, because someone is paying and cannot edit anything.
  for await (const subscription of stripe.subscriptions.list({
    status: 'active',
    limit: 100,
  })) {
    const restaurantId = subscription.metadata?.restaurantId;
    if (!restaurantId) continue;

    const row = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, subscriptionRef: true },
    });

    if (!row) continue;

    if (row.subscriptionRef !== subscription.id) {
      drift.push({
        restaurant: row.id,
        name: row.name,
        ours: row.subscriptionRef ?? 'nothing',
        theirs: `${subscription.id} (active)`,
        reason: 'paying at Stripe but not recorded here',
      });
      if (apply) await syncFromStripe(subscription.id);
    }
  }

  console.log(`Checked ${ours.length} local subscriptions.`);

  if (drift.length === 0) {
    console.log('Everything agrees.');
  } else {
    console.log(`\n${drift.length} disagreement(s):\n`);
    for (const item of drift) {
      console.log(`  ${item.name}`);
      console.log(`    ours   ${item.ours}`);
      console.log(`    stripe ${item.theirs}`);
      console.log(`    why    ${item.reason}\n`);
    }
    console.log(
      apply ? 'Repaired.' : 'Nothing changed. Re-run with --apply to fix.',
    );
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
