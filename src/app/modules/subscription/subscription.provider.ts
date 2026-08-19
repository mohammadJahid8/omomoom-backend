import logger from '../../../shared/logger';

export const PRICE_CENTS = 4900;
export const CURRENCY = 'USD';

export type StartedSubscription = {
  /** The provider's own id. Stored so a webhook can find the restaurant. */
  reference: string;
  paidUntil: Date;
};

export interface PaymentProvider {
  readonly mocked: boolean;
  start(input: {
    restaurantId: string;
    restaurantName: string;
    userEmail: string;
  }): Promise<StartedSubscription>;
  cancel(reference: string | null): Promise<void>;
}

const addMonth = (from: Date): Date => {
  const until = new Date(from);
  until.setMonth(until.getMonth() + 1);
  return until;
};

/**
 * Stands in until Stripe is wired up. Everything downstream (ownership, the
 * Studio gate, cancellation) runs against the same interface, so swapping the
 * implementation is the whole job.
 */
class MockProvider implements PaymentProvider {
  readonly mocked = true;

  async start(input: {
    restaurantId: string;
    restaurantName: string;
    userEmail: string;
  }): Promise<StartedSubscription> {
    logger.info(
      { ...input, priceCents: PRICE_CENTS },
      'Mock subscription started, no card was charged',
    );

    return {
      reference: `mock_${input.restaurantId.slice(0, 8)}_${Date.now().toString(36)}`,
      paidUntil: addMonth(new Date()),
    };
  }

  async cancel(reference: string | null): Promise<void> {
    logger.info({ reference }, 'Mock subscription cancelled');
  }
}

export const paymentProvider: PaymentProvider = new MockProvider();
