/** @jest-environment node */
import type Stripe from 'stripe';
import { CHECKOUT_MARKET_POLICY } from '@/lib/checkout-market';
import { reconcilePack } from '@/lib/pack-settlement';
import { grantCredits, getUserBillingByStripeCustomer, isClosedForPackPurchase, withPackAuthority } from '@/lib/db-access';
jest.mock('@/lib/db-access', () => ({grantCredits: jest.fn(), getUserBillingByStripeCustomer: jest.fn(), isClosedForPackPurchase: jest.fn(),withPackAuthority:jest.fn()}));
jest.mock('@/lib/config', () => ({stripeConfig:{secretKey:'sk_test_fixture',starterPriceId:'price_pack'}}));
const owner = {user_id:'user_owned',stripe_customer_id:'cus_owned',credits_available:5};
const capture = jest.fn(), cancel = jest.fn(), retrieve=jest.fn(), review=jest.fn(), receipt=jest.fn();
const stripe = {paymentIntents:{capture,cancel,retrieve}} as unknown as Stripe;
const asSession = (s: ReturnType<typeof fixture>) => s as unknown as Stripe.Checkout.Session;
function fixture({captured=false,country='AU'}={}) {
  const metadata={changeRoomMarketPolicy:CHECKOUT_MARKET_POLICY,buyerCountry:country,originCountry:country,
    clerkUserId:'user_owned',priceId:'price_pack',mode:'payment',creditAmount:'10'};
  const price={id:'price_pack',type:'one_time',active:true,unit_amount:1499,currency:'aud',metadata:{credits:'10'},product:{id:'prod_pack',active:true}};
  const charge={id:'ch_1',customer:'cus_owned',payment_intent:'pi_1',livemode:false,status:'succeeded',paid:true,
    captured,amount_captured:captured?1499:0,amount:1499,currency:'aud',amount_refunded:0,disputed:false,refunded:false,
    payment_method_details:{type:'card'},billing_details:{address:{country:country as string|null}}};
  const pi={id:'pi_1',status:captured?'succeeded':'requires_capture',capture_method:'manual',customer:'cus_owned',livemode:false,
    metadata:{...metadata},amount:1499,currency:'aud',amount_received:captured?1499:0,amount_capturable:captured?0:1499,latest_charge:charge};
  return {id:'cs_1',created:1794000000,status:'complete',mode:'payment',payment_status:captured?'paid':'unpaid',livemode:false,
    payment_link:null as string|null,subscription:null,customer:'cus_owned',client_reference_id:'user_owned',metadata:{...metadata},
    payment_intent:pi,payment_method_types:['card'],billing_address_collection:'required',customer_details:{address:{country:country as string|null}},
    currency:'aud',amount_total:1499,amount_subtotal:1499,total_details:{amount_discount:0,amount_tax:0,amount_shipping:0},line_items:{has_more:false,data:[{price,quantity:1,amount_total:1499,amount_subtotal:1499,amount_discount:0,amount_tax:0}]}};
}
const reconcile = (s: ReturnType<typeof fixture>, source:'webhook'|'verify-checkout-session'='webhook',succeeded=false) => {retrieve.mockResolvedValue(s.payment_intent);return reconcilePack(stripe,asSession(s),source,undefined,succeeded);};
beforeEach(()=>{jest.resetAllMocks();process.env.VERCEL='1'; process.env.VERCEL_ENV='preview';
  (withPackAuthority as jest.Mock).mockImplementation(async(user,customer,pi,work)=>work({billing:{...owner,is_frozen:false},closed:await isClosedForPackPurchase(user),alreadyGranted:false,
    grant:(amount:number,metadata:Record<string,unknown>)=>grantCredits(user,amount,metadata,pi),review,receipt}));
 (getUserBillingByStripeCustomer as jest.Mock).mockResolvedValue(owner);
  (isClosedForPackPurchase as jest.Mock).mockResolvedValue(false);(grantCredits as jest.Mock).mockResolvedValue({...owner,credits_available:15});});

describe('card authorization and delivery for the limited-market launch',()=>{
  it.each(['AU','NZ'])('captures the exact %s-owned pack; grants nothing until Stripe confirms capture',async(country)=>{
    await expect(reconcile(fixture({country}))).resolves.toMatchObject({settled:false,granted:false});
    expect(capture).toHaveBeenCalledWith('pi_1',{amount_to_capture:1499},expect.objectContaining({idempotencyKey:'changeroom-pack-capture-v1:pi_1'}));
    expect(grantCredits).not.toHaveBeenCalled();expect(cancel).not.toHaveBeenCalled();
    await expect(reconcile(fixture({country,captured:true}))).resolves.toMatchObject({settled:true,creditsGranted:10});
    expect(grantCredits).toHaveBeenCalledWith('user_owned',10,expect.objectContaining({billing_country:country,origin_country:country,buyer_country:country,market_policy:CHECKOUT_MARKET_POLICY}),'pi_1');
  });
  it.each(['CA','NZ',null])('cancels an owned AU authorization with final charge billing country %s',async(country)=>{
    const s=fixture();s.payment_intent.latest_charge.billing_details.address.country=country;
    await expect(reconcile(s)).resolves.toMatchObject({status:'not_completed'});
    expect(cancel).toHaveBeenCalledWith('pi_1',{}, expect.objectContaining({idempotencyKey:'changeroom-pack-cancel-v1:pi_1'}));
    expect(capture).not.toHaveBeenCalled();expect(grantCredits).not.toHaveBeenCalled();
  });
  it.each(['declared outside region','conflicting Checkout billing','conflicting origin','closed user','inactive product'])('does not capture when %s',async(which)=>{
    const s=fixture(which==='declared outside region'?{country:'US'}:{});
    if(which==='conflicting Checkout billing')s.customer_details.address.country='GB';
    if(which==='conflicting origin')s.metadata.originCountry=s.payment_intent.metadata.originCountry='NZ';
    if(which==='closed user')(isClosedForPackPurchase as jest.Mock).mockResolvedValue(true);
    if(which==='inactive product')s.line_items.data[0].price.product.active=false;
    await reconcile(s);expect(cancel).toHaveBeenCalledTimes(1);expect(capture).not.toHaveBeenCalled();expect(grantCredits).not.toHaveBeenCalled();
  });
  it.each(['wrong owner','wrong customer','wrong price metadata','wrong total','partial authorization','live/test mismatch','provider link','multiple lines','wrong charge','offsetting tax and discount'])('never acts on an ambiguous order: %s',async(which)=>{
    const s=fixture();
    if(which==='wrong owner')s.client_reference_id='user_other';if(which==='wrong customer')s.payment_intent.customer='cus_other';
    if(which==='wrong price metadata')s.payment_intent.metadata.priceId='price_other';if(which==='wrong total')s.amount_total=1399;
    if(which==='partial authorization')s.payment_intent.amount_capturable=100;
    if(which==='live/test mismatch')s.livemode=s.payment_intent.livemode=s.payment_intent.latest_charge.livemode=true;
    if(which==='provider link')s.payment_link='plink_other';if(which==='multiple lines')s.line_items.has_more=true;
    if(which==='offsetting tax and discount') {s.total_details.amount_tax=50;s.total_details.amount_discount=50;}
    if(which==='wrong charge')s.payment_intent.latest_charge.payment_intent='pi_other';
    await expect(reconcile(s)).rejects.toThrow();expect(capture).not.toHaveBeenCalled();expect(cancel).not.toHaveBeenCalled();expect(grantCredits).not.toHaveBeenCalled();
  });
  it.each(['processing','requires_action','requires_payment_method','requires_capture','canceled'])('does not acknowledge a signed success when current PI status is %s',async(status)=>{
    const s=fixture();s.payment_intent.status=status;await expect(reconcile(s,'webhook',true)).rejects.toThrow('succeeded_event_payment_not_current');
    expect(capture).not.toHaveBeenCalled();expect(cancel).not.toHaveBeenCalled();expect(grantCredits).not.toHaveBeenCalled();
  });
  it('does not retry or grant a completely refunded successful charge',async()=>{
    const s=fixture({captured:true});Object.assign(s.payment_intent.latest_charge,{amount_refunded:1499,refunded:true});
    await expect(reconcile(s,'webhook',true)).resolves.toMatchObject({status:'refunded',settled:false});expect(grantCredits).not.toHaveBeenCalled();
  });
  it('browser return can neither capture nor cancel a card; authorized but not captured never grants',async()=>{
    const s=fixture();s.payment_status='paid';
    await expect(reconcile(s,'verify-checkout-session')).resolves.toMatchObject({settled:false});s.customer_details.address.country='US';
    await reconcile(s,'verify-checkout-session');expect(capture).not.toHaveBeenCalled();expect(cancel).not.toHaveBeenCalled();expect(grantCredits).not.toHaveBeenCalled();
  });
  it('retries out-of-order events, missing snapshots and provider/network failures without a grant',async()=>{
    const early=fixture();early.status='open'; await expect(reconcile(early)).rejects.toThrow('not_complete_yet');
    const incomplete=fixture();Object.assign(incomplete.payment_intent,{latest_charge:null});await expect(reconcile(incomplete)).rejects.toThrow('unresolved');
    Object.assign(incomplete,{payment_intent:fixture().payment_intent,customer_details:null});await expect(reconcile(incomplete)).rejects.toThrow('not_available');
    capture.mockRejectedValueOnce(new Error('network'));await expect(reconcile(fixture())).rejects.toThrow('pack_payment_manual_review');expect(review).toHaveBeenCalledWith('capture_outcome_unknown','cs_1');
    await reconcile(fixture());expect(capture.mock.calls[0]).toEqual(capture.mock.calls[1]);
    const invalid=fixture();invalid.customer_details.address.country='GB';cancel.mockRejectedValueOnce(new Error('network'));
    await expect(reconcile(invalid)).rejects.toThrow('network');await reconcile(invalid);expect(cancel.mock.calls[0]).toEqual(cancel.mock.calls[1]);
    expect(grantCredits).not.toHaveBeenCalled();
  });
  it('rejects new standalone/untagged packs while preserving genuinely captured historical purchases',async()=>{
    const s=fixture({captured:true});Object.assign(s,{payment_link:'plink_old',metadata:{}});Object.assign(s.payment_intent,{metadata:{}});
    await expect(reconcile(s)).rejects.toThrow('untagged_pack_after_market_cutover');expect(grantCredits).not.toHaveBeenCalled();
    s.created=1700000000;await expect(reconcile(s)).resolves.toMatchObject({settled:true});
    expect(capture).not.toHaveBeenCalled();expect(cancel).not.toHaveBeenCalled();
  });
  it.each(['unpaid session','partial capture','country changed','refunded','disputed','expired','canceled'])('no new credits for %s after a paid-looking return',async(which)=>{
    const s=fixture({captured:true});
    if(which==='unpaid session')s.payment_status='unpaid';if(which==='partial capture')s.payment_intent.latest_charge.amount_captured=100;
    if(which==='country changed')s.customer_details.address.country='US';if(which==='refunded')s.payment_intent.latest_charge.amount_refunded=1499;
    if(which==='disputed')s.payment_intent.latest_charge.disputed=true;if(which==='expired')s.status='expired';if(which==='canceled')s.payment_intent.status='canceled';
    if(['partial capture','country changed','refunded','disputed'].includes(which))await expect(reconcile(s,'verify-checkout-session')).resolves.toMatchObject({status:'needs_review'});
    else await expect(reconcile(s,'verify-checkout-session')).resolves.toMatchObject({settled:false});
    expect(capture).not.toHaveBeenCalled();expect(cancel).not.toHaveBeenCalled();expect(grantCredits).not.toHaveBeenCalled();
  });
});

describe('private buyer receipts', () => {
  const receiptUrl = 'https://pay.stripe.com/receipts/payment/test_receipt';
  it('adds the official current Charge receipt only to the verified owner return, never to a webhook grant or the ledger', async () => {
    const s=fixture({captured:true}); Object.assign(s.payment_intent.latest_charge,{receipt_url:receiptUrl});
    retrieve.mockResolvedValue(s.payment_intent);
    const current = await reconcilePack(stripe,asSession(s),'verify-checkout-session',owner);
    expect(current).toMatchObject({settled:true,receiptUrl});
    expect(await reconcilePack(stripe,asSession(s),'webhook')).not.toHaveProperty('receiptUrl');
    expect(JSON.stringify((grantCredits as jest.Mock).mock.calls)).not.toContain(receiptUrl);
    await expect(reconcilePack(stripe,asSession(s),'verify-checkout-session',{...owner,user_id:'other'})).rejects.toThrow('owner_mismatch');
  });
  it.each(['https://pay.stripe.com.evil.example/receipts/payment/plausible',
    'https://person@pay.stripe.com/receipts/payment/plausible','https://pay.stripe.com/redirect',
    'http://pay.stripe.com/receipts/payment/plausible',null])('unsafe or missing receipt is omitted without blocking delivery',async(url)=>{
    const s=fixture({captured:true}); Object.assign(s.payment_intent.latest_charge,{receipt_url:url});
    retrieve.mockResolvedValue(s.payment_intent);
    const result=await reconcilePack(stripe,asSession(s),'verify-checkout-session',owner);
    expect(result.settled).toBe(true);expect(result).not.toHaveProperty('receiptUrl');
  });
  it.each(['authorization','refund','dispute'])('withholds a paid receipt link for %s',async(state)=>{
    const s=fixture({captured:state!=='authorization'}); Object.assign(s.payment_intent.latest_charge,{receipt_url:receiptUrl});
    if(state==='refund')Object.assign(s.payment_intent.latest_charge,{refunded:true,amount_refunded:1499});
    if(state==='dispute')s.payment_intent.latest_charge.disputed=true;
    retrieve.mockResolvedValue(s.payment_intent);
    const result=await reconcilePack(stripe,asSession(s),'verify-checkout-session',owner);
    expect(result.settled).toBe(false);expect(result).not.toHaveProperty('receiptUrl');
  });
});
