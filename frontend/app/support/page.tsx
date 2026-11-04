import Link from 'next/link';
import { HelpPage, SupportEmail } from '../components/HelpPage';

export const metadata = { title: 'Customer support | IGetDressed.Online' };
export default function SupportPage() {
  return <HelpPage title="Customer support">
    <p>Email <SupportEmail /> for help with your account, credits, photos or a charge. You can contact us even if you cannot sign in.</p>
    <section><h2>Billing and cancellation</h2><p>Sign in to <Link href="/billing">Manage billing</Link> to update your payment method, review invoices or cancel a subscription in the Stripe portal. If the portal does not open, email us from your account address. Tell us whether you want help with a charge, a missing credit or a cancellation.</p></section>
    <section><h2>A payment or credit balance looks wrong</h2><p>One-time packs do not renew, and credits are added only after successful payment. If Checkout says payment failed, review its message before trying again. If a payment appears successful but your credits are missing, reload <Link href="/billing">billing</Link> and contact us with the receipt reference if the balance is still wrong. You do not need to buy the pack again while we check the original payment.</p><p>To ask for a refund, tell us the receipt reference and what went wrong. We will investigate the payment, credits and result before confirming the remedy. Nothing in this process limits consumer rights that apply to your purchase.</p></section>
    <section><h2>If a try-on failed or the result disappeared</h2><p>If you stopped waiting or closed the page, sign in to the same account and use <Link href="/#recent-looks">Refresh recent looks</Link> before generating again. Completed looks can be reopened for 24 hours; download the result to keep it. Starting another try-on can use another credit.</p><p>Check <Link href="/status">service availability</Link>. Include the time and time zone, the request ID if shown, and what you expected. For a payment, include the invoice or receipt number if you have it. Please do not send photos, passwords, card details or sign-in links.</p></section>
    <section><h2>Photos, account deletion and privacy</h2><p>Tell us what you want removed and which account it belongs to. We may need to verify ownership. If you want to stop a subscription, say so explicitly; sending a deletion request is not confirmation of cancellation. See our <Link href="/privacy-policy">privacy policy</Link>.</p></section>
  </HelpPage>;
}
