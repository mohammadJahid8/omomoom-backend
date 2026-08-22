import config from '../../../config';
import logger from '../../../shared/logger';
import prisma from '../../../shared/prisma';
import { stripe } from '../../../shared/stripe';

export const PRICE_CENTS = 4900;
export const CURRENCY = 'USD';

export type StartInput = {
  restaurantId: string;
  restaurantName: string;
  userId: string;
  userEmail: string;
};

/**
 * Starting a subscription ends one of two ways, and the difference is real
 * rather than cosmetic: a mock can decide on the spot that money arrived, a
 * card cannot. Making the caller handle both stops the Stripe path from
 * pretending it knows something it will only learn from a webhook.
 */
export type StartResult =
  | { kind: 'redirect'; url: string }
  | { kind: 'active'; reference: string; paidUntil: Date };

export interface PaymentProvider {
  readonly mocked: boolean;
  start(input: StartInput): Promise<StartResult>;
  cancel(reference: string | null): Promise<void>;
  /** Undo a cancellation inside the period already paid for. No charge. */
  resume(reference: string | null): Promise<void>;
  /**
   * Ends it outright rather than at the period end. For when the listing or
   * the ownership is going away, so there is nothing left to keep paying for.
   */
  cancelNow(reference: string | null): Promise<void>;
  /** Where someone updates a card or reads past invoices. */
  billingPortal(input: {
    userId: string;
    returnUrl: string;
  }): Promise<string | null>;
}

const addMonth = (from: Date): Date => {
  const until = new Date(from);
  until.setMonth(until.getMonth() + 1);
  return until;
};

/** Runs when Stripe is not configured, so development needs no keys. */
class MockProvider implements PaymentProvider {
  readonly mocked = true;

  async start(input: StartInput): Promise<StartResult> {
    logger.info(
      { ...input, priceCents: PRICE_CENTS },
      'Mock subscription started, no card was charged',
    );

    return {
      kind: 'active',
      reference: `mock_${input.restaurantId.slice(0, 8)}_${Date.now().toString(36)}`,
      paidUntil: addMonth(new Date()),
    };
  }

  async cancel(reference: string | null): Promise<void> {
    logger.info({ reference }, 'Mock subscription cancelled');
  }

  async resume(reference: string | null): Promise<void> {
    logger.info({ reference }, 'Mock subscription resumed, no card was charged');
  }

  async cancelNow(reference: string | null): Promise<void> {
    logger.info({ reference }, 'Mock subscription ended immediately');
  }

  async billingPortal(): Promise<string | null> {
    return null;
  }
}

class StripeProvider implements PaymentProvider {
  readonly mocked = false;

  /**
   * One customer per person, reused across every restaurant they own, so a
   * card added once works for all of them and invoices arrive together.
   */
  private async customerFor(userId: string, email: string): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true, name: true },
    });

    if (user?.stripeCustomerId) return user.stripeCustomerId;

    const customer = await stripe!.customers.create({
      email,
      name: user?.name,
      metadata: { userId },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  async start(input: StartInput): Promise<StartResult> {
    const customer = await this.customerFor(input.userId, input.userEmail);
    const back = `${config.appUrl}/dashboard/restaurant/subscription`;

    const session = await stripe!.checkout.sessions.create(
      {
        mode: 'subscription',
        customer,
        line_items: [{ price: config.stripe.priceId, quantity: 1 }],
        success_url: `${back}?checkout=success`,
        cancel_url: `${back}?checkout=cancelled`,
        client_reference_id: input.restaurantId,
        // On the session for `checkout.session.completed`, and on the
        // subscription for every event after it. A webhook that cannot tell
        // which restaurant it means is useless.
        metadata: { restaurantId: input.restaurantId },
        subscription_data: {
          metadata: { restaurantId: input.restaurantId },
        },
      },
      // Deliberately no idempotency key. Stripe replays a keyed response for
      // 24 hours, errors included, so a static key would pin a transient
      // failure in place for a day. Two checkout sessions cost nothing: only
      // one can be completed and the other expires on its own.
    );

    if (!session.url) {
      throw new Error('Stripe returned a checkout session with no URL');
    }

    return { kind: 'redirect', url: session.url };
  }

  async cancel(reference: string | null): Promise<void> {
    if (!reference) return;
    // Not `subscriptions.cancel`: the month is paid for and they keep it.
    await stripe!.subscriptions.update(reference, {
      cancel_at_period_end: true,
    });
  }

  async resume(reference: string | null): Promise<void> {
    if (!reference) return;
    await stripe!.subscriptions.update(reference, {
      cancel_at_period_end: false,
    });
  }

  async cancelNow(reference: string | null): Promise<void> {
    if (!reference) return;

    try {
      await stripe!.subscriptions.cancel(reference);
    } catch (error) {
      // Already gone at Stripe's end is the outcome we wanted anyway. Failing
      // here would block deleting a restaurant, which is worse.
      logger.warn(
        { reference, err: error instanceof Error ? error.message : error },
        'Could not cancel the Stripe subscription',
      );
    }
  }

  async billingPortal(input: {
    userId: string;
    returnUrl: string;
  }): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { stripeCustomerId: true },
    });

    if (!user?.stripeCustomerId) return null;

    const session = await stripe!.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: input.returnUrl,
    });

    return session.url;
  }
}

export const paymentProvider: PaymentProvider = config.stripe.enabled
  ? new StripeProvider()
  : new MockProvider();
