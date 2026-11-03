import React from 'react';
import { SupportEmail } from '../components/HelpPage';
import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';

export default function TermsOfService() {
  return (
    <main className="min-h-screen bg-[#FAF9F6] text-black font-sans">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 text-[#8B5CF6]-400 hover:text-[#8B5CF6]-300 mb-8 transition-colors"
        >
          <ArrowLeft size={18} />
          Back to Home
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <FileText className="text-[#8B5CF6]-400" size={32} />
          <h1 className="text-4xl font-bold text-[#8B5CF6]-300">Terms of Service</h1>
        </div>

        <p className="text-gray-600 mb-8 text-sm">
          Last updated: 4 November 2026
        </p>

        <div className="prose prose-invert max-w-none space-y-8 text-gray-700">
          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">1. Acceptance of Terms</h2>
            <p className="leading-relaxed">
              By accessing and using IGetDressed.Online (&quot;the Service&quot;), you accept and agree to be bound by the terms and provision of this agreement. 
              If you do not agree to abide by the above, please do not use this service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">2. Description of Service</h2>
            <p className="leading-relaxed mb-4">
              IGetDressed.Online is a virtual try-on platform that uses artificial intelligence to generate images of clothing items on user-uploaded photos. 
              The Service also provides product recommendations and shopping links to third-party retailers.
            </p>
            <p className="leading-relaxed">
              We reserve the right to modify, suspend, or discontinue any part of the Service at any time with or without notice.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">3. User Accounts and Registration</h2>
            <p className="leading-relaxed mb-4">
              To use certain features of the Service, you must register for an account. You agree to:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Provide accurate, current, and complete information during registration</li>
              <li>Maintain and update your information to keep it accurate, current, and complete</li>
              <li>Maintain the security of your password and identification</li>
              <li>Accept all responsibility for activities that occur under your account</li>
              <li>Notify us immediately of any unauthorized use of your account</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">4. User Content and Conduct</h2>
            <p className="leading-relaxed mb-4">
              You are responsible for all content you upload, post, or otherwise transmit through the Service. You agree not to:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Upload content that is illegal, harmful, threatening, abusive, or violates any laws</li>
              <li>Upload content that infringes on intellectual property rights of others</li>
              <li>Upload content containing nudity, explicit material, or inappropriate content</li>
              <li>Use the Service for any commercial purpose without our express written consent</li>
              <li>Attempt to gain unauthorized access to the Service or its related systems</li>
              <li>Interfere with or disrupt the Service or servers connected to the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">5. Intellectual Property</h2>
            <p className="leading-relaxed mb-4">
              The Service and its original content, features, and functionality are owned by IGetDressed.Online and are protected by international 
              copyright, trademark, patent, trade secret, and other intellectual property laws.
            </p>
            <p className="leading-relaxed">
              Generated images created through the Service are provided for your personal use. You may not use generated images for commercial 
              purposes without our express written permission.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">6. Payment and Billing</h2>
            <p className="leading-relaxed mb-4">
              Certain features require credits. New purchases, when available, are one-time credit packs. When you buy a pack, you agree to:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Pay all charges associated with your account</li>
              <li>Provide accurate billing information</li>
              <li>Authorize us to charge your payment method</li>
              <li>Use the amount, currency, billing interval and credit allowance shown before payment to decide whether to purchase</li>
            </ul>
            <p className="leading-relaxed mt-4">
              One-time credit packs do not renew. New subscriptions are closed. If you already have a monthly subscription, it renews until cancelled. Credits are added after successful payment. If a renewal fails, paid generation may pause while you update your payment method. Unused purchased credits carry over after cancellation. Cancel in <Link href="/billing" className="underline">Manage billing</Link>; the Stripe portal displays the effective date. Contact <SupportEmail /> if a charge is wrong, the service fails, or you need help cancelling or requesting a refund. Include a receipt reference, never card details.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">7. Third-Party Services</h2>
            <p className="leading-relaxed">
              The Service may contain links to third-party websites or services that are not owned or controlled by IGetDressed.Online. 
              We have no control over, and assume no responsibility for, the content, privacy policies, or practices of any third-party 
              websites or services. You acknowledge and agree that IGetDressed.Online shall not be responsible or liable for any damage or loss 
              caused by your use of any third-party service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">8. Disclaimers and Limitations of Liability</h2>
            <p className="leading-relaxed mb-4">
              Generated images are illustrative and do not guarantee fit, colour or sizing. Nothing in these terms excludes consumer rights or remedies that cannot be excluded by law, including applicable Australian Consumer Law guarantees.
            </p>
            <p className="leading-relaxed mb-4">
              We do not guarantee that:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>The Service will be uninterrupted, secure, or error-free</li>
              <li>Generated images will be accurate or meet your expectations</li>
              <li>Defects will be corrected</li>
            </ul>
            <p className="leading-relaxed mt-4">
              If the service is not provided as described, contact us so we can investigate and discuss the appropriate remedy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">9. Indemnification</h2>
            <p className="leading-relaxed">
              You agree to indemnify, defend, and hold harmless IGetDressed.Online and its officers, directors, employees, and agents from and against 
              any claims, liabilities, damages, losses, and expenses, including reasonable attorneys&apos; fees, arising out of or in any way 
              connected with your access to or use of the Service, your violation of these Terms, or your infringement of any rights of another.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">10. Termination</h2>
            <p className="leading-relaxed">
              We may terminate or suspend your account and access to the Service immediately, without prior notice or liability, for any reason 
              whatsoever, including without limitation if you breach the Terms. Upon termination, your right to use the Service will immediately cease.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">11. Changes to Terms</h2>
            <p className="leading-relaxed">
              We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material, we will 
              provide at least 30 days notice prior to any new terms taking effect. What constitutes a material change will be determined at 
              our sole discretion.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">12. Governing Law</h2>
            <p className="leading-relaxed">
              These Terms shall be governed and construed in accordance with the laws of the jurisdiction in which IGetDressed.Online operates, 
              without regard to its conflict of law provisions.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">13. Contact Information</h2>
            <p className="leading-relaxed">
              If you have questions about these terms, email <SupportEmail /> or visit <Link href="/support" className="underline">Customer support</Link>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

