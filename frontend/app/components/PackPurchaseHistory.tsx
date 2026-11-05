'use client';
import { useEffect, useState } from 'react';
import { CheckoutStatus } from './CheckoutStatus';
import Link from 'next/link';

type History = {purchases:{sessionId:string; addedAt:string; credits:number}[]; hasMore:boolean};
export function PackPurchaseHistory() {
  const [page,setPage] = useState<number | null>(null);
  const [history,setHistory] = useState<History | null>(null);
  const [failed,setFailed] = useState(false);
  const [selected,setSelected] = useState('');
  const [attempt,setAttempt] = useState(0);

  useEffect(() => {
    if (page === null) return;
    const controller = new AbortController();
    setHistory(null); setFailed(false); setSelected('');
    void fetch('/api/billing/pack-purchases?page='+page,{cache:'no-store',signal:controller.signal})
      .then(async r => { if (!r.ok) throw Error(); return r.json() as Promise<History>; })
      .then(data => { if (!controller.signal.aborted) setHistory(data); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  },[page,attempt]);

  return <section className="mt-8 space-y-3" aria-labelledby="pack-history-title">
    <h2 id="pack-history-title" className="text-xl font-bold">Pack purchase history</h2>
    {page === null ? <button className="underline" onClick={()=>setPage(0)}>Find a pack receipt</button> : <>
      {failed ? <p role="alert">Purchase history is unavailable. <button className="underline" onClick={()=>setAttempt(x=>x+1)}>Retry</button> or <Link className="underline" href="/support">contact support</Link>.</p>
        : !history ? <p role="status">Loading purchases…</p> : <>
        {history.purchases.length ? <ul className="space-y-2">{history.purchases.map(p=><li key={p.sessionId}>
          {new Date(p.addedAt).toLocaleDateString()} · {p.credits} pack credits · <button className="underline" onClick={()=>setSelected(p.sessionId)}>Check payment and receipt</button>
          {selected===p.sessionId && <CheckoutStatus key={p.sessionId} sessionId={p.sessionId} />}
        </li>)}</ul> : <p>No pack purchases on this page.</p>}
        <div className="flex gap-4">{page>0 && <button className="underline" onClick={()=>setPage(page-1)}>Newer purchases</button>}
        {history.hasMore && <button className="underline" onClick={()=>setPage(page+1)}>Older purchases</button>}</div>
        <p>For help with a missing receipt or a refund, <Link href="/support" className="underline">contact support</Link>.</p>
      </>}
    </>}
  </section>;
}
