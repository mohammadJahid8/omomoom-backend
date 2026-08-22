import Stripe from 'stripe';

import config from '../config';

/**
 * One client for the whole app. Null until every Stripe variable is present,
 * which is what lets the mock provider stand in during development.
 */
export const stripe = config.stripe.secretKey
  ? new Stripe(config.stripe.secretKey, {
      // Pinned deliberately: an account-level API upgrade should never change
      // how this server reads a subscription without a deploy.
      apiVersion: '2026-07-29.dahlia',
      appInfo: { name: 'Omomoom', url: config.appUrl },
      // Stripe is between the customer and their money, so a blip is worth
      // waiting through rather than failing a checkout over.
      maxNetworkRetries: 2,
      timeout: 20_000,
    })
  : null;

export const stripeEnabled = Boolean(stripe) && config.stripe.enabled;
