/** @jest-environment node */
import {NextRequest} from 'next/server';
import {offers, purchasablePacks} from '@/lib/billing-catalog';
const mockLookup = jest.fn();
const mockCreate = jest.fn();
const mockBilling = jest.fn();
const mockEnabled = jest.fn();
jest.mock('stripe',()=>jest.fn().mockImplementation(()=>({
  prices:{retrieve:mockLookup},checkout:{sessions:{create:mockCreate}}
})));
jest.mock('@clerk/nextjs/server',()=>({auth:async()=>({userId:'fixture'})}));
jest.mock('@/lib/db-access',()=>({getOrCreateUserBilling:(...args:unknown[])=>mockBilling(...args)}));
jest.mock('@/lib/purchase-availability',()=>({
  ...jest.requireActual('@/lib/purchase-availability'),
  canCreateCheckout:()=>mockEnabled(),
}));
jest.mock('@/lib/rate-limit',()=>({checkRateLimit:()=>({allowed:true})}));
jest.mock('@/lib/config',()=>({appConfig:{appUrl:'https://fixture.test'},stripeConfig:{
  secretKey:'sk_test_mock',webhookSecret:'whsec_mock',starterPriceId:'price_starter',
  powerPriceId:'price_power',creatorPriceId:'price_creator',proPriceId:'price_pro',valuePriceId:'price_value',
  starterXmasPriceId:'price_history',
}}));
async function post(body:object) {
  const {POST} = await import('@/app/api/billing/create-checkout-session/route');
  return POST(new NextRequest('https://fixture.test/api/billing/create-checkout-session',{
    method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'},
  }));
}
beforeEach(()=>{
  jest.clearAllMocks();mockEnabled.mockReturnValue(true);
  mockBilling.mockResolvedValue({stripe_customer_id:'cus_fixture',stripe_subscription_id:'sub_old'});
  mockCreate.mockResolvedValue({url:'https://checkout.stripe.test/fixture'});
});
it.each([{sku:'creator'},{sku:'power'},{priceId:'price_creator',mode:'payment'},
  {priceId:'price_creator',mode:'subscription'},{priceId:'price_power',mode:'subscription'},
  {priceId:'price_starter',mode:'subscription'},{priceId:'price_history',mode:'payment'},
  {sku:'starter-pack',mode:'subscription'},{attemptId:'old-open-session'}])(
  'never creates or resumes recurring/retired/forged checkouts after packs are enabled: %j',async body=>{
    expect((await post(body)).status).toBe(400);expect(mockLookup).not.toHaveBeenCalled();
    expect(mockBilling).not.toHaveBeenCalled();expect(mockCreate).not.toHaveBeenCalled();
  });
it.each(purchasablePacks)('sells only a verified single-payment $sku even to an existing subscriber',async pack=>{
  mockLookup.mockResolvedValue({type:'one_time',active:true,unit_amount:pack.cents,currency:'aud',
    metadata:{credits:String(pack.credits)}, product:{active:true}});
  expect((await post({sku:pack.sku})).status).toBe(200);
  expect(mockCreate).toHaveBeenCalledTimes(1);
  const options=mockCreate.mock.calls[0][0];
  expect(options.mode).toBe('payment');expect(options.subscription_data).toBeUndefined();
  expect(options.payment_method_types).toEqual(['card']);
  expect(options.payment_intent_data.metadata.creditAmount).toBe(String(pack.credits));
});
it.each([
  {priceId:'price_starter',cents:1499,credits:10},
  {priceId:'price_value',cents:3499,credits:30},
  {priceId:'price_pro',cents:8999,credits:100},
])('also restricts the legacy owned $priceId request to card',async pack=>{
  mockLookup.mockResolvedValue({type:'one_time',active:true,unit_amount:pack.cents,currency:'aud',
    metadata:{credits:String(pack.credits)},product:{active:true}});
  expect((await post({priceId:pack.priceId,mode:'payment'})).status).toBe(200);
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
    mode:'payment',payment_method_types:['card'],line_items:[{price:pack.priceId,quantity:1}],
  }));
});
it.each([
  {payment_method_types:['klarna']},
  {payment_method_configuration:'pmc_other'},
  {automatic_payment_methods:{enabled:true}},
  {payment_intent_data:{payment_method_types:['au_becs_debit']}},
].flatMap(override=>[
  {sku:'starter-pack',...override},
  {priceId:'price_starter',mode:'payment',...override},
]))('rejects caller payment-method overrides before contacting Stripe: %j',async body=>{
  expect((await post(body)).status).toBe(400);
  expect(mockLookup).not.toHaveBeenCalled();expect(mockBilling).not.toHaveBeenCalled();
  expect(mockCreate).not.toHaveBeenCalled();
});
it.each([{type:'recurring'},{currency:'usd'},{unit_amount:1999},{active:false},
  {product:{active:false}}, {product:'prod_unexpanded'},{metadata:{}},{metadata:{credits:'5'}}])(
  'fails closed when Stripe disagrees with the approved pack (%j)', async change=>{
    mockLookup.mockResolvedValue({type:'one_time',active:true,unit_amount:1499,currency:'aud',metadata:{credits:'10'},product:{active:true},...change});
    expect((await post({sku:'starter-pack'})).status).toBe(503);expect(mockCreate).not.toHaveBeenCalled();
  });
it('keeps all public pack and subscription creation closed while the release gate is down',async()=>{
  mockEnabled.mockReturnValue(false);
  for (const o of offers) expect((await post({sku:o.sku})).status).toBe(503);
  expect(mockLookup).not.toHaveBeenCalled();expect(mockCreate).not.toHaveBeenCalled();
});
