'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
export function CheckoutStatus({onSettled}: {onSettled:()=>Promise<void>}) {
  const [message,setMessage] = useState('');
  const refresh = useRef(onSettled);
  useEffect(()=>{refresh.current=onSettled;},[onSettled]);
  useEffect(()=>{
    const session=new URL(window.location.href).searchParams.get('session_id');
    if (!session) return;
    let stopped=false, timer:ReturnType<typeof setTimeout> | undefined, checks=0;
    const controller=new AbortController();
    async function check() {
      if (stopped) return;
      checks++;
      try {
        const response=await fetch('/api/billing/verify-checkout-session',{
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:session}),signal:controller.signal});
        if (!response.ok && response.status===403) {
          if (!stopped) setMessage('This checkout does not belong to the signed-in account.'); return;
        }
        const result = response.ok ? await response.json() : null;
        if (result?.status === 'needs_review' && !result.settled) {
          if (!stopped) setMessage('This checkout needs a support review. Please contact support with the checkout time. Do not pay again.');
          return;
        }
        if (result?.status === 'refunded' && !result.settled) {
          if (!stopped) setMessage('Stripe shows a full refund for this payment. Contact support if you need help with your balance.');
          return;
        }
        if (result?.status === 'not_completed' && !result.settled) {
          if (!stopped) setMessage('This payment was not completed. No money was collected and no credits were added. Your bank may show a temporary authorization.');
          return;
        }
        if (result?.settled) {
          if (stopped) return;
          setMessage('Payment confirmed. Your balance has been updated.');
          const url=new URL(window.location.href);url.searchParams.delete('session_id');window.history.replaceState({},'',url);
          await refresh.current(); return;
        }
      } catch { /* temporary network failure; retry below */ }
      if (stopped) return;
      if (checks<8) timer=setTimeout(check,3000);
      else setMessage('We are still confirming this checkout. Reload billing later or contact support with the checkout time. You do not need to pay again.');
    }
    setMessage('Confirming payment and updating your balance…');
    void check();
    return ()=>{ stopped=true;controller.abort();clearTimeout(timer); };
  },[]);
  return message ? <p role="status" className="mb-4 rounded-lg bg-blue-50 p-4">{message}{/contact support/i.test(message) && <> <Link href="/support" className="underline">Get support</Link></>}</p> : null;
}
