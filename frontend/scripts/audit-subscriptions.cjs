// Read-only: compare paid initial/renewal invoices with recorded credit grants.
// Run via scripts/agent/run-with-secrets.sh. No writes, including in dry-run mode.
const Stripe = require('stripe');
const {Client} = require('pg');
async function main() {
  const since = process.argv[2];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since||'')) throw new Error('Usage: node scripts/audit-subscriptions.cjs YYYY-MM-DD');
  const start=Math.floor(Date.parse(since+'T00:00:00Z')/1000);
  if (!Number.isSafeInteger(start)) throw new Error('Invalid date');
  const stripe=new Stripe(process.env.STRIPE_SECRET_KEY,{apiVersion:'2026-02-25.clover'});
  const prices=new Set([process.env.STRIPE_CREATOR_PRICE_ID,process.env.STRIPE_POWER_PRICE_ID].filter(Boolean));
  if (prices.size!==2) throw new Error('Both distinct recurring price IDs are required');
  const db=new Client({connectionString:process.env.DATABASE_URL||process.env.POSTGRES_URL,
    options:'-c default_transaction_read_only=on'});
  await db.connect();
  let checked=0,issues=0;
  try {
    for await(const i of stripe.invoices.list({status:'paid',created:{gte:start},limit:100})){
      if(!['subscription_create','subscription_cycle'].includes(i.billing_reason)||i.amount_paid<=0) continue;
      const line=i.lines.data.find(l=>prices.has(l.pricing?.price_details?.price || l.price?.id));
      if(!line) continue;
      checked++;
      const r=await db.query("SELECT b.user_id AS owner, l.user_id AS credited, l.credits_change AS amount FROM users_billing b LEFT JOIN credit_ledger_entries l ON l.entry_type='grant' AND (l.metadata->>'invoice_id'=$2 OR l.request_id=$3) WHERE b.stripe_customer_id=$1",[i.customer,i.id,'stripe_invoice:'+i.id+':subscription_cycle']);
      const expected=(line.pricing?.price_details?.price||line.price?.id)===process.env.STRIPE_CREATOR_PRICE_ID ? 25 : 70;
      if(r.rowCount!==1 || r.rows[0].owner!==r.rows[0].credited || r.rows[0].amount!==expected){
        issues++; console.log(JSON.stringify({invoice:i.id,reason:'review_owner_or_grant',expected}));
      }
    }
    console.log(JSON.stringify({checked,issues}));if(issues)process.exitCode=2;
  } finally {await db.end();}
}
main().catch(e=>{console.error('Audit did not complete:',e.code||e.name);process.exitCode=1;});
