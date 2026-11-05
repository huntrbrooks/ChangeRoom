/** @jest-environment node */
import {NextRequest} from 'next/server';
import {offers, purchasablePacks} from '@/lib/billing-catalog';
import {expectedCheckoutLivemode} from '@/lib/checkout-market';
const mockLookup = jest.fn();
const mockCreate = jest.fn();
const mockBilling = jest.fn();
const mockEnabled = jest.fn();
const mockAuth = jest.fn();
const mockCustomer = jest.fn();
const mockSaveCustomer = jest.fn();
const mockClosed = jest.fn();
const mockKey = jest.fn();
jest.mock('stripe',()=>jest.fn().mockImplementation(()=>({
  prices:{retrieve:mockLookup},checkout:{sessions:{create:mockCreate}},customers:{create:mockCustomer}
})));
jest.mock('@clerk/nextjs/server',()=>({auth:()=>mockAuth()}));
jest.mock('@/lib/db-access',()=>({getOrCreateUserBilling:(...args:unknown[])=>mockBilling(...args),
  isClosedForPackPurchase:(...args:unknown[])=>mockClosed(...args),
  setStripeCustomerIdForUser:(...args:unknown[])=>mockSaveCustomer(...args)}));
jest.mock('@/lib/purchase-availability',()=>({
  ...jest.requireActual('@/lib/purchase-availability'),
  canCreateCheckout:()=>mockEnabled(),
}));
jest.mock('@/lib/rate-limit',()=>({checkRateLimit:()=>({allowed:true})}));
jest.mock('@/lib/config',()=>({appConfig:{appUrl:'https://fixture.test'},stripeConfig:{
  get secretKey(){return mockKey();},webhookSecret:'whsec_mock',starterPriceId:'price_starter',
  powerPriceId:'price_power',creatorPriceId:'price_creator',proPriceId:'price_pro',valuePriceId:'price_value',
  starterXmasPriceId:'price_history',
}}));
const originalEnv = {VERCEL:process.env.VERCEL,VERCEL_ENV:process.env.VERCEL_ENV};
afterAll(()=>{
  for (const [key,value] of Object.entries(originalEnv)) {
    if(value===undefined) delete process.env[key]; else process.env[key]=value;
  }
});
async function post(body:object, {geo='AU',declared=true,headers={},query=''}:
    {geo?:string|null;declared?:boolean;headers?:Record<string,string>;query?:string}={}) {
  const {POST} = await import('@/app/api/billing/create-checkout-session/route');
  const payload=declared?{buyerCountry:'AU',personalUse:true,...body}:body;
  return POST(new NextRequest('https://fixture.test/api/billing/create-checkout-session'+query,{
    method:'POST',body:JSON.stringify(payload),headers:{'Content-Type':'application/json',
      ...(geo!==null?{'x-vercel-ip-country':geo}:{}),...headers},
  }));
}
beforeEach(()=>{
  process.env.VERCEL='1'; process.env.VERCEL_ENV='preview';
  jest.clearAllMocks();mockEnabled.mockReturnValue(true);
  mockAuth.mockResolvedValue({userId:'fixture'});
  mockClosed.mockResolvedValue(false);mockKey.mockReturnValue('sk_test_mock');
  mockBilling.mockResolvedValue({stripe_customer_id:'cus_fixture',stripe_subscription_id:'sub_old',is_frozen:false});
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
  mockLookup.mockResolvedValue({type:'one_time',active:true,livemode:false,unit_amount:pack.cents,currency:'aud',
    metadata:{credits:String(pack.credits)}, product:{active:true}});
  expect((await post({sku:pack.sku})).status).toBe(200);
  expect(mockCreate).toHaveBeenCalledTimes(1);
  const options=mockCreate.mock.calls[0][0];
  expect(options.mode).toBe('payment');expect(options.subscription_data).toBeUndefined();
  expect(options.payment_method_types).toEqual(['card']);
  expect(options.billing_address_collection).toBe('required');
  expect(options.adaptive_pricing).toEqual({enabled:false});
  expect(options.metadata).toMatchObject({creditAmount:String(pack.credits),buyerCountry:'AU',originCountry:'AU',changeRoomMarketPolicy:'au-nz-consumer-v1'});
  expect(options.automatic_tax).toEqual({enabled:false});
  expect(options.payment_intent_data).toEqual({capture_method:'manual',metadata:options.metadata,
    description:`${pack.name} — ${pack.credits} ChangeRoom try-on credits. FRESH'N UP AU PTY LTD, ABN 11 678 658 823. No GST charged.`});
});
it.each([
  {priceId:'price_starter',cents:1499,credits:10},
  {priceId:'price_value',cents:3499,credits:30},
  {priceId:'price_pro',cents:8999,credits:100},
])('also restricts the legacy owned $priceId request to card',async pack=>{
  mockLookup.mockResolvedValue({type:'one_time',active:true,livemode:false,unit_amount:pack.cents,currency:'aud',
    metadata:{credits:String(pack.credits)},product:{active:true}});
  expect((await post({priceId:pack.priceId,mode:'payment',buyerCountry:'NZ'},{geo:'NZ'})).status).toBe(200);
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
    mode:'payment',payment_method_types:['card'],line_items:[{price:pack.priceId,quantity:1}],
    billing_address_collection:'required', adaptive_pricing:{enabled:false},
    payment_intent_data:expect.objectContaining({capture_method:'manual',metadata:expect.objectContaining({buyerCountry:'NZ',originCountry:'NZ',changeRoomMarketPolicy:'au-nz-consumer-v1'})}),
  }));
});
it.each([
  {payment_method_types:['klarna']},
  {payment_method_configuration:'pmc_other'},
  {automatic_payment_methods:{enabled:true}},
  {payment_intent_data:{payment_method_types:['au_becs_debit']}},
  {originCountry:'NZ'}, {changeRoomMarketPolicy:'allow-all'}, {adaptive_pricing:{enabled:true}},
].flatMap(override=>[
  {sku:'starter-pack',...override},
  {priceId:'price_starter',mode:'payment',...override},
]))('rejects caller payment-method overrides before contacting Stripe: %j',async body=>{
  expect((await post(body)).status).toBe(400);
  expect(mockLookup).not.toHaveBeenCalled();expect(mockBilling).not.toHaveBeenCalled();
  expect(mockCreate).not.toHaveBeenCalled();
});
it.each([{type:'recurring'},{currency:'usd'},{unit_amount:1999},{active:false},{livemode:true},
  {product:{active:false}}, {product:'prod_unexpanded'},{metadata:{}},{metadata:{credits:'5'}}])(
  'fails closed when Stripe disagrees with the approved pack (%j)', async change=>{
    mockLookup.mockResolvedValue({type:'one_time',active:true,livemode:false,unit_amount:1499,currency:'aud',metadata:{credits:'10'},product:{active:true},...change});
    expect((await post({sku:'starter-pack'})).status).toBe(503);expect(mockCreate).not.toHaveBeenCalled();
  });
it('keeps all public pack and subscription creation closed while the release gate is down',async()=>{
  mockEnabled.mockReturnValue(false);
  for (const o of offers) expect((await post({sku:o.sku})).status).toBe(503);
  expect(mockLookup).not.toHaveBeenCalled();expect(mockCreate).not.toHaveBeenCalled();
});

function expectNoAcquisition() {
  for (const fn of [mockLookup,mockClosed,mockBilling,mockCustomer,mockSaveCustomer,mockCreate]) expect(fn).not.toHaveBeenCalled();
}

it.each([['production','sk_test_mock'], ['preview','sk_live_mock'], ['production','pk_live_public'],
  ['preview','rk_live_fixture'], ['production','rk_test_fixture'], ['production','sk_live_']])(
  'refuses a misconfigured key before Stripe and billing: %s/%s', async(stage,key)=>{
    process.env.VERCEL_ENV=stage;mockKey.mockReturnValue(key);
    expect((await post({sku:'starter-pack'})).status).toBe(500);expectNoAcquisition();
  });
it.each([['production','sk_live_fixture',true], ['production','rk_live_fixture',true],
  ['preview','sk_test_fixture',false], ['preview','rk_test_fixture',false]] as const)(
  'binds the expected Stripe livemode to the hosted deployment (%s/%s)',(stage,key,expected)=>{
    process.env.VERCEL_ENV=stage;expect(expectedCheckoutLivemode(key)).toBe(expected);
    delete process.env.VERCEL;expect(expectedCheckoutLivemode(key)).toBeNull();
  });

it.each(['closed','frozen','unknown'] as const)('does not create a customer or session for %s billing state', async state=>{
  mockLookup.mockResolvedValue({type:'one_time',active:true,livemode:false,unit_amount:1499,currency:'aud',metadata:{credits:'10'},product:{active:true}});
  mockClosed.mockResolvedValue(state==='closed');
  mockBilling.mockResolvedValue({stripe_customer_id:null,is_frozen:state==='unknown'?undefined:state==='frozen'});
  expect((await post({sku:'starter-pack'})).status).toBe(403);
  if (state==='closed') expect(mockBilling).not.toHaveBeenCalled();
  for (const fn of [mockCustomer,mockSaveCustomer,mockCreate]) expect(fn).not.toHaveBeenCalled();
});

describe.each([{sku:'starter-pack'},{priceId:'price_starter',mode:'payment'}])('market restriction on %j', selection=>{
  it.each([{}, {buyerCountry:'AU'}, {personalUse:true}, {buyerCountry:'AU',personalUse:false},
    {buyerCountry:'US',personalUse:true}, {buyerCountry:'au',personalUse:true}, {buyerCountry:'NZ',personalUse:'true'}])(
    'requires an explicit supported residence and personal-use declaration: %j', async declaration=>{
      expect((await post({...selection,...declaration},{declared:false})).status).toBe(400);
      expectNoAcquisition();
    });
  it.each([null, 'US', 'NZ', 'AU, NZ', 'au', 'XX'])('rejects absent, conflicting or malformed country %j', async geo=>{
    expect((await post(selection,{geo,headers:{'cf-ipcountry':'AU','x-forwarded-country':'AU'}})).status).toBe(403);
    expectNoAcquisition();
  });
  it('rejects a query override even when the real declaration and edge country agree', async()=>{
    expect((await post(selection,{query:'?originCountry=NZ'})).status).toBe(400);expectNoAcquisition();
  });
});

it.each([['0','production'],['','preview'],['1','development'],['1','']])(
  'does not trust a matching header on a non-hosted runtime (%s/%s)',async(vercel,stage)=>{
    process.env.VERCEL=vercel;process.env.VERCEL_ENV=stage;
    expect((await post({sku:'starter-pack'})).status).toBe(403);expectNoAcquisition();
  });

it('requires authentication even with valid location evidence',async()=>{
  mockAuth.mockResolvedValue({userId:null});
  expect((await post({sku:'starter-pack'})).status).toBe(401);expectNoAcquisition();
});
