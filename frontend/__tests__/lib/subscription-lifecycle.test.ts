/** @jest-environment node */
import type Stripe from 'stripe';
import {invoiceSubscription, paidAllowance, liveSnapshot, priceMatchesOffer} from '@/lib/subscription-lifecycle';
import {subscriptionCheckout} from '@/lib/subscription-checkout';
import {offers, packCredits, resolveCheckout} from '@/lib/billing-catalog';

const prices={creatorPriceId:'price_create',powerPriceId:'price_power',starterXmasPriceId:'price_retired'};
const line={period:{start:100,end:200},quantity:1,pricing:{price_details:{price:'price_create'}}};
const invoice={id:'in_paid',created:100,currency:'aud',amount_paid:2499,status:'paid',billing_reason:'subscription_create',parent:{subscription_details:{subscription:'sub_b'}},lines:{data:[line],has_more:false}};
it('reads Clover subscription identity and awards the price purchased on that invoice, not a later upgraded plan',()=>{
  expect(invoiceSubscription(invoice)).toBe('sub_b');
  expect(paidAllowance(invoice,prices)).toMatchObject({subscription:'sub_b',credits:25,periodStart:100});
  expect(paidAllowance({...invoice,billing_reason:'subscription_cycle',lines:{data:[{...line,pricing:{price_details:{price:'price_power'}}}]}},prices)?.credits).toBe(70);
  expect(packCredits(prices,'price_retired')).toBe(20);
});
it('never grants for an unpaid first invoice, a free trial or a proration; rejects unrecognised paid allowances',()=>{
  for(const change of [{status:'open'},{amount_paid:0},{billing_reason:'subscription_update'}]) expect(paidAllowance({...invoice,...change},prices)).toBeNull();
  expect(()=>paidAllowance({...invoice,lines:{data:[{...line,quantity:2}]}},prices)).toThrow();
  expect(()=>paidAllowance({...invoice,lines:{data:[{...line,pricing:{price_details:{price:'price_unknown'}}}]}},prices)).toThrow();
});
it('blocks checkout when Stripe has a different price, interval, currency or inactive product',()=>{
  const price={active:true,unit_amount:2499,currency:'aud',type:'recurring',recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
  const matches=(p:object)=>priceMatchesOffer(p as Stripe.Price,offers[0]);
  expect(matches(price)).toBe(true);
  for(const changes of [{active:false},{unit_amount:5000},{currency:'usd'},{recurring:{interval:'year'}}]) expect(matches({...price,...changes})).toBe(false);
});
it('derives access from Stripe current state, ignoring old cancelled subscriptions, and freezes due invoices',async()=>{
  const data=[{id:'ended',status:'canceled'}, {id:'current',status:'active',items:{data:[{quantity:1,current_period_end:200,price:{id:'price_power'}}]},latest_invoice:{status:'open',attempt_count:1,amount_remaining:4999}}];
  const stripe={subscriptions:{list:()=>data}} as unknown as Stripe;
  expect(await liveSnapshot(stripe,'cus',prices)).toMatchObject({id:'current',plan:'pro',frozen:true});
  data[1].latest_invoice={status:'paid',attempt_count:2,amount_remaining:0};
  expect((await liveSnapshot(stripe,'cus',prices)).frozen).toBe(false);
  data.push(data[1]);
  await expect(liveSnapshot(stripe,'cus',prices)).rejects.toThrow('ambiguous');
});
it('reopens the existing subscription checkout and refuses new checkout after completion or decline',async()=>{
  const reserveCheckout=jest.fn().mockResolvedValue({attempt_id:'once',price_id:'price_create',session_id:'cs_1',created_at:new Date()});
  const repo={reserveCheckout,recordCheckout:jest.fn(),retireCheckout:jest.fn()};
  const sessions={create:jest.fn(),retrieve:jest.fn().mockResolvedValue({status:'open',url:'https://checkout.stripe.test/fixture'})};
  const list=jest.fn().mockReturnValue([]);
  const stripe={checkout:{sessions},subscriptions:{list,retrieve:jest.fn().mockResolvedValue({status:'active'})}} as unknown as Stripe;
  expect((await subscriptionCheckout(stripe,repo,'user','cus','price_create','https://fixture.test')).status).toBe('open');
  sessions.retrieve.mockResolvedValue({status:'complete',subscription:'sub_1'});
  await expect(subscriptionCheckout(stripe,repo,'user','cus','price_create','https://fixture.test')).rejects.toThrow('completed');
  list.mockReturnValue([{status:'past_due'}]);
  await expect(subscriptionCheckout(stripe,repo,'user','cus','price_create','https://fixture.test')).rejects.toThrow('already associated');
  expect(sessions.create).not.toHaveBeenCalled();
});

it('resolves Pro pack from the server SKU even when the browser environment names an unrelated recurring price',()=>{
  const config={proPriceId:'price_pack_server',powerPriceId:'price_monthly'};
  expect(resolveCheckout(config,{sku:'pro-pack'})).toMatchObject({priceId:'price_pack_server',mode:'payment'});
  expect(resolveCheckout(config,{priceId:'price_monthly',mode:'payment'})).toBeNull();
  expect(resolveCheckout(config,{sku:'retired-promo'})).toBeNull();
});
