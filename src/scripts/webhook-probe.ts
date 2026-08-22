/**
 * Sends a correctly signed Stripe event at our own webhook, twice.
 *
 *   npm run stripe:probe
 *
 * Proves signature verification accepts real events and that a redelivery is
 * recognised rather than acted on again.
 */
import Stripe from 'stripe';

import config from '../config';

const URL = `http://localhost:${config.port}${config.apiPrefix}/webhooks/stripe`;

async function send(payload: string, signature: string) {
  const response = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': signature },
    body: payload,
  });
  return { status: response.status, body: await response.json() };
}

async function main() {
  const id = `evt_probe_${Date.now().toString(36)}`;

  const payload = JSON.stringify({
    id,
    object: 'event',
    type: 'invoice.paid',
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: 'in_probe', object: 'invoice' } },
  });

  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: config.stripe.webhookSecret,
  });

  console.log('  first delivery :', JSON.stringify(await send(payload, signature)));
  console.log('  redelivery     :', JSON.stringify(await send(payload, signature)));

  const stale = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: config.stripe.webhookSecret,
    timestamp: Math.floor(Date.now() / 1000) - 60 * 60,
  });
  console.log('  hour-old replay:', JSON.stringify(await send(payload, stale)));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
