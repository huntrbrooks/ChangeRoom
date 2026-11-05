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
const mockCapture=jest.fn(), mockCancel=jest.fn();
jest.mock('stripe',()=>{
  const stripe=jest.requireActual('stripe');
  return jest.fn().mockImplementation(()=>({
    webhooks:stripe.webhooks, paymentIntents:{capture:mockCapture,cancel:mockCancel,retrieve:async()=>structuredClone(mockStripeSession.payment_intent)}, checkout:{sessions:{
      retrieve:async()=>structuredClone(mockStripeSession), list:async()=>({data:[{id:mockStripeSession.id}]})
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
    process.env.VERCEL='1';process.env.VERCEL_ENV='preview';
    for(const k of ['STARTER','VALUE','PRO']) process.env['STRIPE_'+k+'_PRICE_ID']='price_fixture_'+k;
    const parsed=new URL(url);
    if (!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test')) throw new Error('Use only a local *_test database');
    admin=new Pool({connectionString:url});await admin.query('CREATE SCHEMA '+schema);
    mockPool=new Pool({connectionString:url,options:'-c search_path='+schema});

    db=require('@/lib/db-access');
    // Runtime DDL checks inspect public's catalog; install billing tables in this isolated schema.
    const base=fs.readFileSync(path.resolve('../database/schema.sql'),'utf8');
    const start=base.indexOf('CREATE TABLE IF NOT EXISTS users_billing');
    await mockPool.query('CREATE TABLE account_closures (user_id text PRIMARY KEY,billing_state text,last_error text,last_attempt_at timestamptz)');
    await mockPool.query(base.slice(start,base.indexOf('-- user_profiles:',start)));
    await mockPool.query(fs.readFileSync(path.resolve('../database/migration_subscriber_billing_v2.sql'),'utf8'));
    const ledger=base.indexOf('CREATE TABLE IF NOT EXISTS credit_holds');
    await mockPool.query(base.slice(ledger,base.indexOf('WHERE request_id IS NOT NULL;',ledger)+'WHERE request_id IS NOT NULL;'.length));
  });
  beforeEach(async()=>{
    mockCapture.mockReset();mockCancel.mockReset();
    await mockPool.query('TRUNCATE credit_ledger_entries,credit_holds,users_billing,billing_checkout_attempts,account_closures');
    await mockPool.query('INSERT INTO users_billing(user_id,stripe_customer_id,credits_available) VALUES($1,$2,100)',[user,customer]);
    await mockPool.query("INSERT INTO credit_ledger_entries(id,user_id,request_id,entry_type,credits_change,metadata) VALUES(gen_random_uuid(),$1,'pi_pack','grant',100,'{\"source\":\"stripe\",\"reason\":\"credit_pack_purchase\"}')",[user]);
  });
  afterAll(async()=>{if(mockPool) await mockPool.end(); if(admin){await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}});
  it('lists only the signed-in buyer’s original pack grants, across pages, without returning private receipt links',async()=>{
    async function seed(owner,prefix,count){
      await mockPool.query(`INSERT INTO credit_ledger_entries(id,user_id,request_id,entry_type,credits_change,metadata)
        SELECT gen_random_uuid(),$1,$2 || n,'grant',10,jsonb_build_object('source','stripe','reason','credit_pack_purchase',
          'payment_intent_id',$2 || n,'session_id','cs_test_' || $2 || n,'receipt_url','must-not-escape') FROM generate_series(1,$3) n`,
        [owner,prefix,count]);
    }
    await seed(user,'pi_mine',21);await seed('someone_else','pi_other',2);
    const first=await db.listPackPurchases(user,0),second=await db.listPackPurchases(user,1);
    expect(first.hasMore).toBe(true);expect(second.hasMore).toBe(false);
    const all=[...first.purchases,...second.purchases];
    expect(new Set(all.map(x=>x.sessionId)).size).toBe(21);
    expect(all.every(x=>x.sessionId.startsWith('cs_test_pi_mine')&&x.credits===10)).toBe(true);
    expect(JSON.stringify(all)).not.toContain('must-not-escape');
  });
  it.each([['STARTER',10],['VALUE',30],['PRO',100]])('settles a signed %s pack once across webhook retries and browser verification',async(sku,credits)=>{
    const {NextRequest}=require('next/server');
    const webhook=require('@/app/api/webhooks/stripe/route').POST;
    const verify=require('@/app/api/billing/verify-checkout-session/route').POST;
    const price='price_fixture_'+sku;
    const pi='pi_fixture_'+sku, cents={STARTER:1499,VALUE:3499,PRO:8999}[sku];
    mockStripeSession={id:'cs_test_fixture_'+sku,created:1700000000,mode:'payment',customer,payment_status:'paid',metadata:{clerkUserId:user},
      client_reference_id:user,amount_total:cents,payment_intent:{id:pi,status:'succeeded',customer,amount_received:cents,
        latest_charge:{payment_intent:pi,captured:true,amount_captured:cents}},line_items:{has_more:false,data:[{price:{id:price},quantity:1}]}};
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
      postEvent('payment_intent.succeeded',{id:pi,metadata:{priceId:price}}),
      verify(new NextRequest('https://fixture.test/api/billing/verify-checkout-session',{method:'POST',
        body:JSON.stringify({sessionId:mockStripeSession.id}),headers:{'Content-Type':'application/json'}}))
    ]);
    expect(replay.map(r=>r.status)).toEqual([200,200,200]);
    expect((await replay[2].json()).settled).toBe(true);
    expect((await balance()).credits_available).toBe(99+credits);
    expect((await mockPool.query("SELECT count(*)::int AS count FROM credit_ledger_entries WHERE request_id=$1 AND entry_type='grant'",[pi])).rows[0].count).toBe(1);
  });
  it.each(['AU','NZ','rejected','closure-wins','capture-wins','frozen','partial-refund'])('settles signed market-limited %s authorization, webhook and browser return with the real ledger',async(scenario)=>{
    const {NextRequest}=require('next/server');
    const webhook=require('@/app/api/webhooks/stripe/route').POST;
    const verify=require('@/app/api/billing/verify-checkout-session/route').POST;
    const sessionId='cs_test_market',id='pi_market',country=scenario==='NZ'?'NZ':'AU';
    const meta={changeRoomMarketPolicy:'au-nz-consumer-v1',buyerCountry:country,originCountry:country,clerkUserId:user,
      priceId:'price_fixture_STARTER',mode:'payment',creditAmount:'10'};
    const charge={id:'ch_market',payment_intent:id,customer,amount:1499,currency:'aud',captured:false,amount_captured:0,
      amount_refunded:0,refunded:false,disputed:false,status:'succeeded',paid:true,livemode:false,
      payment_method_details:{type:'card'},billing_details:{address:{country:scenario==='rejected'?'US':country}}};
    const pi={id,metadata:{...meta},customer,livemode:false,capture_method:'manual',amount:1499,amount_received:0,
      amount_capturable:1499,currency:'aud',status:'requires_capture',latest_charge:charge};
    mockStripeSession={id:sessionId,created:1794000000,mode:'payment',status:'complete',payment_status:'unpaid',
      customer,livemode:false,payment_link:null,client_reference_id:user,metadata:meta,payment_intent:pi,
      billing_address_collection:'required',customer_details:{address:{country}},payment_method_types:['card'],
      currency:'aud',amount_subtotal:1499,amount_total:1499,total_details:{amount_discount:0,amount_shipping:0,amount_tax:0},line_items:{has_more:false,data:[{quantity:1,amount_discount:0,amount_tax:0,amount_total:1499,
        amount_subtotal:1499,price:{id:meta.priceId,active:true,currency:'aud',type:'one_time',unit_amount:1499,
          metadata:{credits:'10'},product:{id:'prod_market',active:true}}}]}};
    const event=async(type,object,extra={})=>{
      const payload=JSON.stringify({id:'evt_market',object:'event',type,data:{object},...extra});
      const sig=jest.requireActual('stripe').webhooks.generateTestHeaderString({payload,secret:process.env.STRIPE_WEBHOOK_SECRET});
      return webhook(new NextRequest('https://fixture.test/api/webhooks/stripe',{method:'POST',headers:{'stripe-signature':sig},body:payload}));
    };
    const ownerReturn=()=>verify(new NextRequest('https://fixture.test/api/billing/verify-checkout-session',{method:'POST',
      headers:{'content-type':'application/json'},body:JSON.stringify({sessionId})}));
    expect((await (await ownerReturn()).json()).settled).toBe(false);
    await event('payment_intent.amount_capturable_updated',pi,{account:'acct_other'});
    expect(mockCapture).not.toHaveBeenCalled();expect(mockCancel).not.toHaveBeenCalled();
    mockCancel.mockImplementation(async()=>{pi.status='canceled';pi.amount_capturable=0;});
    mockCapture.mockImplementation(async()=>{Object.assign(pi,{status:'succeeded',amount_received:1499,amount_capturable:0});
      Object.assign(charge,{captured:true,amount_captured:1499});mockStripeSession.payment_status='paid';});
    if(scenario==='frozen')await mockPool.query('UPDATE users_billing SET is_frozen=true WHERE user_id=$1',[user]);
    let finishCapture, markStarted;
    const started=new Promise(r=>{markStarted=r;}), release=new Promise(r=>{finishCapture=r;});
    if(scenario==='capture-wins')mockCapture.mockImplementation(async()=>{
      markStarted();await release;
      Object.assign(pi,{status:'succeeded',amount_received:1499,amount_capturable:0});
      Object.assign(charge,{captured:true,amount_captured:1499});mockStripeSession.payment_status='paid';
    });
    const closing=await mockPool.connect();
    try {
      if(scenario==='closure-wins'){
        await closing.query('BEGIN');await closing.query('SELECT pg_advisory_xact_lock(hashtextextended($1,4711))',[user]);
        // The same tombstone/lock barrier used by request_account_closure().
        await closing.query('INSERT INTO account_closures(user_id) VALUES($1)',[user]);
      }
      const checkout=event('checkout.session.completed',mockStripeSession);
      if(scenario==='closure-wins'){
        // Confirm the webhook is blocked on the held advisory lock, not merely scheduled later.
        let waiting=false;for(let i=0;i<100&&!waiting;i++){
          waiting=(await mockPool.query("SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.datname=current_database() AND l.locktype='advisory' AND NOT l.granted) AS waiting")).rows[0].waiting;
          if(!waiting)await new Promise(r=>setTimeout(r,10));
        }
        expect(waiting).toBe(true);await closing.query('COMMIT');
      } else if(scenario==='capture-wins'){
        await started;await closing.query('BEGIN');
        expect((await closing.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,4711)) AS got',[user])).rows[0].got).toBe(false);
        finishCapture();await closing.query('SELECT pg_advisory_xact_lock(hashtextextended($1,4711))',[user]);
        await closing.query('INSERT INTO account_closures(user_id) VALUES($1)',[user]);await closing.query('COMMIT');
      }
      expect((await checkout).status).toBe(200);
    } finally {finishCapture();await closing.query('ROLLBACK');closing.release();}
    expect((await balance()).credits_available).toBe(100); // never grants just because capture was requested
    if(['rejected','closure-wins','frozen'].includes(scenario)){
      expect(mockCapture).not.toHaveBeenCalled();expect(mockCancel).toHaveBeenCalledTimes(1);
      expect((await (await ownerReturn()).json()).status).toBe('not_completed');
      await event('payment_intent.amount_capturable_updated',pi);expect(mockCancel).toHaveBeenCalledTimes(1);
      expect((await balance()).credits_available).toBe(100);return;
    }
    expect(mockCapture).toHaveBeenCalledTimes(1);expect(mockCancel).not.toHaveBeenCalled();
    if(scenario==='capture-wins'){
      // Even with Stripe redelivery offline, the deletion finds the unsettled capture.
      await db.flagUndeliveredPackOnClosure(user);
      expect((await mockPool.query('SELECT billing_state,last_error FROM account_closures')).rows[0])
        .toEqual({billing_state:'review',last_error:'pack_payment_manual_review'});
    }
    if(scenario==='partial-refund')charge.amount_refunded=100;
    if(['capture-wins','partial-refund'].includes(scenario)){
      expect((await event('payment_intent.succeeded',pi)).status).toBe(503);
      expect((await (await ownerReturn()).json()).status).toBe('needs_review');
      const cases=await mockPool.query("SELECT entry_type,credits_change FROM credit_ledger_entries WHERE metadata->>'reason'='pack_payment_review'");
      expect(cases.rows).toEqual([{entry_type:'adjustment',credits_change:0}]);expect((await balance()).credits_available).toBe(100);
      if(scenario==='capture-wins')expect((await mockPool.query('SELECT billing_state,last_error FROM account_closures')).rows[0])
        .toEqual({billing_state:'review',last_error:'pack_payment_manual_review'});
      return;
    }
    const outcomes=await Promise.all([event('payment_intent.succeeded',pi),ownerReturn(),event('checkout.session.completed',mockStripeSession)]);
    expect(outcomes.map(r=>r.status)).toEqual([200,200,200]);expect((await outcomes[1].json()).settled).toBe(true);
    expect((await balance()).credits_available).toBe(110);
    await mockPool.query("INSERT INTO account_closures(user_id,billing_state) VALUES($1,'pending')",[user]);
    await db.flagUndeliveredPackOnClosure(user);
    expect((await mockPool.query('SELECT billing_state FROM account_closures')).rows[0].billing_state).toBe('pending');
    expect((await mockPool.query("SELECT count(*)::int AS n FROM credit_ledger_entries WHERE request_id=$1 AND entry_type='grant'",[id])).rows[0].n).toBe(1);
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
