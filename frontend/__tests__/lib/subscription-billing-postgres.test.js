/** @jest-environment node */
// Opt in using a dedicated local test database. No live Stripe credentials or production DB.
const {Pool} = require('pg');
const fs = require('node:fs');
const path = require('node:path');
const url = process.env.BILLING_TEST_DATABASE_URL;
const schema = 'billtest_'+require('node:crypto').randomUUID().replaceAll('-','');
let mockPool;
function mockTag(client) {
  return (strings,...values) => client.query(strings.reduce((q,s,i)=>q+(i ? '$'+i : '')+s,''),values);
}
jest.mock('@/lib/db',()=>({
  sql:Object.assign((strings,...values)=>mockTag(mockPool)(strings,...values),{
    connect:async()=>{const c=await mockPool.connect();return {query:c.query.bind(c),sql:mockTag(c),release:()=>c.release()};}
  })
}));
// Real HMAC verification and live SQL transactions; replace only Stripe's network I/O.
let mockStripeSession;
jest.mock('stripe',()=>{
  const stripe=jest.requireActual('stripe');
  return jest.fn().mockImplementation(()=>({
    webhooks:stripe.webhooks, checkout:{sessions:{
      retrieve:async()=>mockStripeSession, list:async()=>({data:[{id:mockStripeSession.id}]})
    }}
  }));
});
jest.mock('@clerk/nextjs/server',()=>({auth:async()=>({userId:'buyer'})}));
(url ? describe : describe.skip)('subscription money movement against PostgreSQL',()=>{
  let db,admin;
  const user='buyer',customer='cus_fixture';
  const active={id:'sub_new',plan:'standard',frozen:false,endsAt:'2031-03-01T00:00:00Z'};
  const award={invoiceId:'in_a',subscription:'sub_new',created:Math.floor(Date.now()/1000)+10,periodStart:1,periodEnd:2,credits:25,price:'price_creator'};
  const sync=(a,s=active)=>db.syncSubscriptionBilling(customer,async()=>s,a);
  const balance=async()=>(await mockPool.query('SELECT credits_available,plan,is_frozen FROM users_billing WHERE user_id=$1',[user])).rows[0];
  beforeAll(async()=>{
    for(const k of ['STARTER','VALUE','PRO']) process.env['STRIPE_'+k+'_PRICE_ID']='price_fixture_'+k;
    const parsed=new URL(url);
    if (!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test')) throw new Error('Use only a local *_test database');
    admin=new Pool({connectionString:url});await admin.query('CREATE SCHEMA '+schema);
    mockPool=new Pool({connectionString:url,options:'-c search_path='+schema});

    db=require('@/lib/db-access');
    // Runtime DDL checks inspect public's catalog; install billing tables in this isolated schema.
    const base=fs.readFileSync(path.resolve('../database/schema.sql'),'utf8');
    const start=base.indexOf('CREATE TABLE IF NOT EXISTS users_billing');
    await mockPool.query(base.slice(start,base.indexOf('-- user_profiles:',start)));
    await mockPool.query(fs.readFileSync(path.resolve('../database/migration_subscriber_billing_v2.sql'),'utf8'));
    const ledger=base.indexOf('CREATE TABLE IF NOT EXISTS credit_holds');
    await mockPool.query(base.slice(ledger,base.indexOf('WHERE request_id IS NOT NULL;',ledger)+'WHERE request_id IS NOT NULL;'.length));
  });
  beforeEach(async()=>{
    await mockPool.query('TRUNCATE credit_ledger_entries,credit_holds,users_billing,billing_checkout_attempts');
    await mockPool.query('INSERT INTO users_billing(user_id,stripe_customer_id,credits_available) VALUES($1,$2,100)',[user,customer]);
    await mockPool.query("INSERT INTO credit_ledger_entries(id,user_id,request_id,entry_type,credits_change,metadata) VALUES(gen_random_uuid(),$1,'pi_pack','grant',100,'{\"source\":\"stripe\",\"reason\":\"credit_pack_purchase\"}')",[user]);
  });
  afterAll(async()=>{if(mockPool) await mockPool.end(); if(admin){await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}});
  it.each([['STARTER',10],['VALUE',30],['PRO',100]])('settles a signed %s pack once across webhook retries and browser verification',async(sku,credits)=>{
    const {NextRequest}=require('next/server');
    const webhook=require('@/app/api/webhooks/stripe/route').POST;
    const verify=require('@/app/api/billing/verify-checkout-session/route').POST;
    const price='price_fixture_'+sku;
    mockStripeSession={id:'cs_test_fixture_'+sku,mode:'payment',customer,payment_status:'paid',metadata:{clerkUserId:user},
      client_reference_id:user,payment_intent:'pi_fixture_'+sku,line_items:{has_more:false,data:[{price:{id:price},quantity:1}]}};
    const postEvent=async(type,object,invalid=false)=>{
      const payload=JSON.stringify({id:'evt_fixture',type,data:{object},object:'event'});
      const sig=jest.requireActual('stripe').webhooks.generateTestHeaderString({payload,secret:invalid?'wrong-fixture-key':process.env.STRIPE_WEBHOOK_SECRET});
      return webhook(new NextRequest('https://fixture.test/api/webhooks/stripe',{method:'POST',headers:{'stripe-signature':sig},body:payload}));
    };
    expect((await postEvent('checkout.session.completed',mockStripeSession,true)).status).toBe(400);
    mockStripeSession.payment_status='unpaid';
    expect((await postEvent('checkout.session.completed',mockStripeSession)).status).toBe(200);
    expect((await balance()).credits_available).toBe(100);
    mockStripeSession.payment_status='paid';
    expect((await postEvent('checkout.session.async_payment_succeeded',mockStripeSession)).status).toBe(200);
    expect((await balance()).credits_available).toBe(100+credits);
    await db.createCreditHold({userId:user,requestId:'one-look',amount:1});await db.finalizeDebitFromHold('one-look');
    const replay=await Promise.all([
      postEvent('checkout.session.completed',mockStripeSession),
      postEvent('payment_intent.succeeded',{id:mockStripeSession.payment_intent,metadata:{priceId:price}}),
      verify(new NextRequest('https://fixture.test/api/billing/verify-checkout-session',{method:'POST',
        body:JSON.stringify({sessionId:mockStripeSession.id}),headers:{'Content-Type':'application/json'}}))
    ]);
    expect(replay.map(r=>r.status)).toEqual([200,200,200]);
    expect((await replay[2].json()).settled).toBe(true);
    expect((await balance()).credits_available).toBe(99+credits);
    expect((await mockPool.query("SELECT count(*)::int AS count FROM credit_ledger_entries WHERE request_id=$1 AND entry_type='grant'",[mockStripeSession.payment_intent])).rows[0].count).toBe(1);
  });
  it('retains a pack, awards only once for concurrent duplicate invoices and replays after spending',async()=>{
    await Promise.all([sync(award),sync(award),sync({...award,invoiceId:'in_duplicate_period'})]);
    expect((await balance()).credits_available).toBe(125);
    await db.createCreditHold({userId:user,requestId:'job-credit-test',amount:1});
    await db.finalizeDebitFromHold('job-credit-test');
    await sync(award);
    expect((await balance()).credits_available).toBe(124);
    await sync({...award,invoiceId:'in_b',periodStart:2,periodEnd:3});
    expect((await balance()).credits_available).toBe(149);
  });
  it('does not mutate credits during failure, recovery or cancellation; late events use current state',async()=>{
    await sync(award);await sync(null,{...active,frozen:true});expect((await balance()).is_frozen).toBe(true);
    await sync(null,active);await sync(null,{plan:'free',id:null,frozen:false,endsAt:null});
    await sync(award,{plan:'free',id:null,frozen:false,endsAt:null});
    expect(await balance()).toEqual({credits_available:125,is_frozen:false,plan:'free'});
  });
  it('rolls back a pre-cutover unattributed invoice for manual reconciliation',async()=>{
    await expect(sync({...award,created:1})).rejects.toThrow('legacy_paid_invoice');
    expect((await balance()).credits_available).toBe(100);
  });
  it('keeps one stable checkout reservation for competing plan selections',async()=>{
    const results=await Promise.all(['a','b','a'].map(p=>db.reserveCheckout(user,p)));
    expect(new Set(results.map(a=>a.attempt_id)).size).toBe(1);
    expect(new Set(results.map(a=>a.price_id)).size).toBe(1);
  });
  it('preserves a historical unitemized balance through cancellation, reads, later purchases and spend',async()=>{
    await mockPool.query('TRUNCATE credit_ledger_entries');
    await mockPool.query("UPDATE users_billing SET plan='standard',trials_remaining=0 WHERE user_id=$1",[user]);
    await sync(null,{plan:'free',id:null,frozen:false,endsAt:null});
    expect((await db.getOrCreateUserBilling(user)).credits_available).toBe(100);
    await db.grantCredits(user,10,{source:'stripe'},'pi_new');
    await db.createCreditHold({userId:user,requestId:'subsequent-job',amount:1});
    await db.finalizeDebitFromHold('subsequent-job');
    expect((await db.getOrCreateUserBilling(user)).credits_available).toBe(109);
  });
  it('retains a separately paid pack when a legacy free trial is consumed',async()=>{
    await db.markFreeTrialUsed(user);expect((await balance()).credits_available).toBe(100);
  });
});
