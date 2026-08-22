import type { Request, Response } from 'express';
import type Stripe from 'stripe';

import config from '../../../config';
import logger from '../../../shared/logger';
import prisma from '../../../shared/prisma';
import { stripe } from '../../../shared/stripe';
import { syncFromStripe } from '../subscription/subscription.sync';

/**
 * What Stripe tells us happened. Anything not listed is acknowledged and
 * ignored: Stripe sends far more than we asked for, and a 200 stops it
 * retrying something we were never going to act on.
 */
const HANDLED = new Set<string>([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
]);

/** Every event we handle points at a subscription, in one of three shapes. */
function subscriptionIdFrom(event: Stripe.Event): string | null {
  const object = event.data.object as unknown as Record<string, unknown>;

  if (event.type.startsWith('customer.subscription.')) {
    return typeof object.id === 'string' ? object.id : null;
  }

  // Checkout sessions and invoices both name the subscription they belong to,
  // sometimes expanded into an object rather than left as an id.
  const ref = object.subscription ?? object.parent;

  if (typeof ref === 'string') return ref;

  if (ref && typeof ref === 'object') {
    const nested = ref as Record<string, unknown>;
    if (typeof nested.id === 'string') return nested.id;

    const details = nested.subscription_details as
      | Record<string, unknown>
      | undefined;
    const inner = details?.subscription;
    if (typeof inner === 'string') return inner;
    if (inner && typeof inner === 'object') {
      const id = (inner as Record<string, unknown>).id;
      return typeof id === 'string' ? id : null;
    }
  }

  return null;
}

/**
 * Verified, deduplicated, and acknowledged quickly.
 *
 * Three rules this endpoint lives by:
 *
 *   - A bad signature is a 400, never a 500. Stripe retries 5xx for days, so
 *     answering 500 to a request that will never succeed buys nothing but noise.
 *   - The event id is written before any work. Delivery is at-least-once, and
 *     a repeat must be a no-op rather than a second period, a second email, or
 *     a second charge.
 *   - Reply fast. Stripe gives a handler seconds, not minutes, and this API can
 *     be waking a suspended database when the request lands.
 */
export const handleStripeWebhook = async (req: Request, res: Response) => {
  if (!stripe) {
    logger.warn('Stripe webhook received but Stripe is not configured');
    res.status(503).json({ received: false });
    return;
  }

  const signature = req.headers['stripe-signature'];

  if (typeof signature !== 'string') {
    res.status(400).json({ received: false, reason: 'missing signature' });
    return;
  }

  let event: Stripe.Event;

  try {
    // `req.body` is a Buffer here, not an object. Anything that parses and
    // re-serialises the body first will fail this check every time.
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      signature,
      config.stripe.webhookSecret,
    );
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : error },
      'Stripe webhook signature rejected',
    );
    res.status(400).json({ received: false, reason: 'bad signature' });
    return;
  }

  try {
    await prisma.webhookEvent.create({
      data: { id: event.id, type: event.type },
    });
  } catch {
    // The only way this fails is the id already existing, which is exactly the
    // repeat we are guarding against.
    logger.info({ id: event.id, type: event.type }, 'Stripe event already seen');
    res.json({ received: true, duplicate: true });
    return;
  }

  if (!HANDLED.has(event.type)) {
    logger.debug({ type: event.type }, 'Stripe event ignored');
    res.json({ received: true });
    return;
  }

  const subscriptionId = subscriptionIdFrom(event);

  if (!subscriptionId) {
    logger.warn({ type: event.type }, 'Stripe event carried no subscription');
    res.json({ received: true });
    return;
  }

  try {
    await syncFromStripe(subscriptionId);
  } catch (error) {
    // The id is already in the ledger, so a Stripe retry would be skipped as a
    // duplicate. Reconciliation is what repairs this, not another delivery.
    logger.error(
      { err: error instanceof Error ? error.message : error, id: event.id },
      'Stripe event accepted but could not be applied',
    );
  }

  res.json({ received: true });
};
