const Stripe = require('stripe');
const path = require('path');
const fs = require('fs');

// Try to load from backend/.env first, then frontend/.env.local
const backendEnvPath = path.join(__dirname, '../../backend/.env');
const frontendEnvPath = path.join(__dirname, '../.env.local');

if (fs.existsSync(backendEnvPath)) {
  require('dotenv').config({ path: backendEnvPath });
} else if (fs.existsSync(frontendEnvPath)) {
  require('dotenv').config({ path: frontendEnvPath });
} else {
  require('dotenv').config();
}

// Get Stripe secret key from environment
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  console.error('❌ STRIPE_SECRET_KEY not found in environment variables');
  console.log('Please set STRIPE_SECRET_KEY in your .env.local file');
  process.exit(1);
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2025-02-24.acacia',
});

async function createPrice({ name, description, amountCents, currency = 'aud', recurring, metadata }) {
  const product = await stripe.products.create({
    name,
    description,
  });

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: amountCents,
    currency,
    recurring,
    metadata,
  });

  return { product, price };
}

async function createStripeProducts() {
  console.log('🚀 Setting up Stripe products and prices (AUD)...\n');

  try {
    const results = {};

    // One-time credit packs
    results.STARTER = await createPrice({
      name: 'Starter',
      description: 'Starter pack – 10 credits',
      amountCents: 1499,
      metadata: { credits: 10 },
    });

    results.STARTER_XMAS = await createPrice({
      name: 'Starter Xmas Promo',
      description: 'Limited Xmas promo – 20 credits',
      amountCents: 1499,
      metadata: { credits: 20, promo: 'xmas-2025', limit: '1 per customer' },
    });

    results.VALUE = await createPrice({
      name: 'Value Pack',
      description: 'Value pack – 30 credits',
      amountCents: 3499,
      metadata: { credits: 30 },
    });

    results.PRO = await createPrice({
      name: 'Pro Pack',
      description: 'Pro pack – 100 credits',
      amountCents: 8999,
      metadata: { credits: 100 },
    });

    // Optional subscriptions
    results.CREATOR = await createPrice({
      name: 'Creator Subscription',
      description: 'Monthly creator plan',
      amountCents: 4999,
      recurring: { interval: 'month' },
      metadata: { plan: 'creator' },
    });

    results.POWER = await createPrice({
      name: 'Power Subscription',
      description: 'Monthly power plan',
      amountCents: 12999,
      recurring: { interval: 'month' },
      metadata: { plan: 'power' },
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Add these to your .env.local file (and Vercel vars):');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`STRIPE_STARTER_PRICE_ID=${results.STARTER.price.id}`);
    console.log(`STRIPE_STARTER_XMAS_PRICE_ID=${results.STARTER_XMAS.price.id}`);
    console.log(`STRIPE_VALUE_PRICE_ID=${results.VALUE.price.id}`);
    console.log(`STRIPE_PRO_PRICE_ID=${results.PRO.price.id}`);
    console.log(`STRIPE_CREATOR_PRICE_ID=${results.CREATOR.price.id}`);
    console.log(`STRIPE_POWER_PRICE_ID=${results.POWER.price.id}\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✨ All products and prices created successfully!');
    console.log('💡 Make sure to copy the Price IDs above to your env files.\n');

  } catch (error) {
    console.error('❌ Error creating Stripe products:', error.message);
    if (error.type === 'StripeAuthenticationError') {
      console.error('\n💡 Make sure your STRIPE_SECRET_KEY is correct');
      console.error('   Use test mode key (sk_test_...) for testing');
      console.error('   Use live mode key (sk_live_...) for production\n');
    }
    process.exit(1);
  }
}

// Run the script
createStripeProducts();

