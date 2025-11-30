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

async function createStripeProducts() {
  console.log('🚀 Setting up Stripe products and prices...\n');

  try {
    // 1. Create Standard Plan
    console.log('📦 Creating Standard Plan...');
    const standardProduct = await stripe.products.create({
      name: 'Standard Plan',
      description: '50 credits/month - Perfect for regular users',
    });

    const standardPrice = await stripe.prices.create({
      product: standardProduct.id,
      unit_amount: 999, // $9.99 in cents
      currency: 'usd',
      recurring: {
        interval: 'month',
      },
    });

    console.log('✅ Standard Plan created!');
    console.log(`   Product ID: ${standardProduct.id}`);
    console.log(`   Price ID: ${standardPrice.id}\n`);

    // 2. Create Pro Plan
    console.log('📦 Creating Pro Plan...');
    const proProduct = await stripe.products.create({
      name: 'Pro Plan',
      description: '250 credits/month - Best value for power users',
    });

    const proPrice = await stripe.prices.create({
      product: proProduct.id,
      unit_amount: 1999, // $19.99 in cents
      currency: 'usd',
      recurring: {
        interval: 'month',
      },
    });

    console.log('✅ Pro Plan created!');
    console.log(`   Product ID: ${proProduct.id}`);
    console.log(`   Price ID: ${proPrice.id}\n`);

    // 3. Create Small Credit Pack
    console.log('📦 Creating Small Credit Pack...');
    const smallPackProduct = await stripe.products.create({
      name: 'Small Credit Pack',
      description: '20 credits - Pay as you go',
    });

    const smallPackPrice = await stripe.prices.create({
      product: smallPackProduct.id,
      unit_amount: 499, // $4.99 in cents
      currency: 'usd',
    });

    console.log('✅ Small Credit Pack created!');
    console.log(`   Product ID: ${smallPackProduct.id}`);
    console.log(`   Price ID: ${smallPackPrice.id}\n`);

    // 4. Create Large Credit Pack
    console.log('📦 Creating Large Credit Pack...');
    const largePackProduct = await stripe.products.create({
      name: 'Large Credit Pack',
      description: '100 credits - Best value for credit packs',
    });

    const largePackPrice = await stripe.prices.create({
      product: largePackProduct.id,
      unit_amount: 1999, // $19.99 in cents
      currency: 'usd',
    });

    console.log('✅ Large Credit Pack created!');
    console.log(`   Product ID: ${largePackProduct.id}`);
    console.log(`   Price ID: ${largePackPrice.id}\n`);

    // Output .env format
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Add these to your .env.local file:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`STRIPE_STANDARD_PRICE_ID=${standardPrice.id}`);
    console.log(`STRIPE_PRO_PRICE_ID=${proPrice.id}`);
    console.log(`STRIPE_CREDIT_PACK_SMALL_PRICE_ID=${smallPackPrice.id}`);
    console.log(`STRIPE_CREDIT_PACK_LARGE_PRICE_ID=${largePackPrice.id}\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✨ All products and prices created successfully!');
    console.log('💡 Make sure to copy the Price IDs above to your .env.local file\n');

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

