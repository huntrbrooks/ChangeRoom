import Link from 'next/link';
import { HelpPage, SupportEmail } from '../components/HelpPage';
import { NEW_PURCHASES_ENABLED, PURCHASE_PAUSE_NOTICE } from '@/lib/purchase-availability';

export const metadata = { title: 'Service availability | IGetDressed.Online' };
export default function StatusPage() {
  return <HelpPage title="Service availability">
    <section><h2>New purchases</h2><p>{NEW_PURCHASES_ENABLED ? 'The site is accepting new purchases.' : PURCHASE_PAUSE_NOTICE}</p></section>
    <section><h2>Already paid?</h2><p>Use <Link href="/billing">Manage billing</Link> to review invoices, change your payment method or cancel. A pause on new purchases does not cancel an existing subscription. If you cannot access a paid result or your credits look wrong, email <SupportEmail /> with the time and request or receipt number.</p></section>
    <p>This page reports the site’s purchase setting. For help with an individual request, <Link href="/support">contact support</Link>.</p>
  </HelpPage>;
}
