/**
 * Creates the owner plan in Stripe and prints the price id.
 *
 *   npm run stripe:setup
 *
 * Safe to run twice. It looks for an existing product with the same lookup key
 * before creating anything, so a second run reports what is already there
 * rather than quietly billing two products with the same name.
 */
import config from '../config';
import { stripe } from '../shared/stripe';

/** Stable handle for the price, so this script can find its own work again. */
const LOOKUP_KEY = 'omomoom_owner_monthly';
const PRODUCT_NAME = 'Omomoom owner plan';
const UNIT_AMOUNT = 4900;
/**
 * "Software as a service, business use". Required by Stripe's managed
 * payments, and it decides how the price is taxed per state.
 */
const TAX_CODE = 'txcd_10103001';
const CURRENCY = 'usd';

async function main() {
  if (!stripe) {
    console.error('STRIPE_SECRET_KEY is not set.');
    process.exit(1);
  }

  console.log(
    `Mode: ${config.stripe.testMode ? 'TEST' : 'LIVE'}  (from the key prefix)`,
  );

  const existing = await stripe.prices.list({
    lookup_keys: [LOOKUP_KEY],
    active: true,
    expand: ['data.product'],
  });

  const found = existing.data[0];

  if (found) {
    // An older run may predate the tax code, which managed payments requires.
    const product = found.product as { id: string; tax_code?: string | null };
    if (!product.tax_code) {
      await stripe.products.update(product.id, { tax_code: TAX_CODE });
      console.log(`\nBackfilled the tax code on ${product.id}`);
    }

    console.log('\nAlready set up. Nothing created.');
    console.log(`  price   ${found.id}`);
    console.log(`  amount  ${(found.unit_amount ?? 0) / 100} ${found.currency}`);
    console.log(`\nSTRIPE_PRICE_ID=${found.id}`);
    return;
  }

  const product = await stripe.products.create({
    name: PRODUCT_NAME,
    description:
      'Keep your listing accurate: hours, links, story, dishes and photos.',
    tax_code: TAX_CODE,
  });

  const price = await stripe.prices.create({
    product: product.id,
    lookup_key: LOOKUP_KEY,
    unit_amount: UNIT_AMOUNT,
    currency: CURRENCY,
    recurring: { interval: 'month' },
    // The advertised $49 is what the customer pays. Any tax comes out of it
    // rather than being added at checkout, so the price on the page is honest.
    tax_behavior: 'inclusive',
  });

  console.log('\nCreated:');
  console.log(`  product ${product.id}`);
  console.log(`  price   ${price.id}`);
  console.log(`\nAdd this to your .env:\n\nSTRIPE_PRICE_ID=${price.id}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
