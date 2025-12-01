import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Shield } from 'lucide-react';

export default function PrivacyPolicy() {
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
          <Shield className="text-[#8B5CF6]-400" size={32} />
          <h1 className="text-4xl font-bold text-[#8B5CF6]-300">Privacy Policy</h1>
        </div>

        <p className="text-gray-600 mb-8 text-sm">
          Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>

        <div className="prose prose-invert max-w-none space-y-8 text-gray-700">
          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">1. Introduction</h2>
            <p className="leading-relaxed">
              Change Room (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy. This Privacy Policy explains 
              how we collect, use, disclose, and safeguard your information when you use our virtual try-on service and website.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">2. Information We Collect</h2>
            
            <h3 className="text-xl font-semibold mb-3 text-[#8B5CF6]-400 mt-6">2.1 Information You Provide</h3>
            <p className="leading-relaxed mb-4">
              We collect information that you provide directly to us, including:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Account information (name, email address, password)</li>
              <li>Profile photos and images you upload</li>
              <li>Clothing item images you upload</li>
              <li>Payment and billing information</li>
              <li>Communications with us (support requests, feedback)</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 text-[#8B5CF6]-400 mt-6">2.2 Automatically Collected Information</h3>
            <p className="leading-relaxed mb-4">
              When you use our Service, we automatically collect certain information, including:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Device information (IP address, browser type, operating system)</li>
              <li>Usage data (pages visited, features used, time spent)</li>
              <li>Cookies and similar tracking technologies</li>
              <li>Log files and analytics data</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">3. How We Use Your Information</h2>
            <p className="leading-relaxed mb-4">
              We use the information we collect to:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Provide, maintain, and improve our Service</li>
              <li>Process virtual try-on requests and generate images</li>
              <li>Manage your account and process payments</li>
              <li>Send you technical notices, updates, and support messages</li>
              <li>Respond to your comments, questions, and requests</li>
              <li>Monitor and analyze usage patterns and trends</li>
              <li>Detect, prevent, and address technical issues and security threats</li>
              <li>Personalize your experience</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">4. Image Processing and Storage</h2>
            <p className="leading-relaxed mb-4">
              When you upload images to our Service:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Images are processed using AI models to generate virtual try-on results</li>
              <li>Images may be temporarily stored on our servers during processing</li>
              <li>We implement security measures to protect your images</li>
              <li>Images may be stored for a limited time to improve service quality</li>
              <li>You can request deletion of your images at any time</li>
            </ul>
            <p className="leading-relaxed mt-4">
              We do not use your images to train AI models without your explicit consent, and we do not share your images with third parties 
              except as necessary to provide the Service (e.g., cloud storage providers).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">5. Information Sharing and Disclosure</h2>
            <p className="leading-relaxed mb-4">
              We do not sell your personal information. We may share your information in the following circumstances:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>Service Providers:</strong> With third-party vendors who perform services on our behalf (cloud storage, payment processing, analytics)</li>
              <li><strong>Legal Requirements:</strong> When required by law or to protect our rights and safety</li>
              <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
              <li><strong>With Your Consent:</strong> When you explicitly authorize us to share your information</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">6. Data Security</h2>
            <p className="leading-relaxed">
              We implement appropriate technical and organizational security measures to protect your personal information against unauthorized 
              access, alteration, disclosure, or destruction. However, no method of transmission over the Internet or electronic storage is 
              100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">7. Cookies and Tracking Technologies</h2>
            <p className="leading-relaxed mb-4">
              We use cookies and similar tracking technologies to:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Remember your preferences and settings</li>
              <li>Analyze how you use our Service</li>
              <li>Provide personalized content and advertisements</li>
              <li>Improve our Service&apos;s functionality</li>
            </ul>
            <p className="leading-relaxed mt-4">
              You can control cookies through your browser settings. However, disabling cookies may limit your ability to use certain features 
              of our Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">8. Your Rights and Choices</h2>
            <p className="leading-relaxed mb-4">
              Depending on your location, you may have certain rights regarding your personal information, including:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>Access:</strong> Request access to your personal information</li>
              <li><strong>Correction:</strong> Request correction of inaccurate information</li>
              <li><strong>Deletion:</strong> Request deletion of your personal information</li>
              <li><strong>Portability:</strong> Request transfer of your data to another service</li>
              <li><strong>Objection:</strong> Object to processing of your personal information</li>
              <li><strong>Withdrawal of Consent:</strong> Withdraw consent where processing is based on consent</li>
            </ul>
            <p className="leading-relaxed mt-4">
              To exercise these rights, please contact us using the information provided at the end of this Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">9. Children&apos;s Privacy</h2>
            <p className="leading-relaxed">
              Our Service is not intended for children under the age of 13 (or the applicable age of consent in your jurisdiction). 
              We do not knowingly collect personal information from children. If you believe we have collected information from a child, 
              please contact us immediately, and we will take steps to delete such information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">10. International Data Transfers</h2>
            <p className="leading-relaxed">
              Your information may be transferred to and processed in countries other than your country of residence. These countries may 
              have data protection laws that differ from those in your country. By using our Service, you consent to the transfer of your 
              information to these countries.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">11. Data Retention</h2>
            <p className="leading-relaxed">
              We retain your personal information for as long as necessary to provide the Service, comply with legal obligations, resolve 
              disputes, and enforce our agreements. When you delete your account, we will delete or anonymize your personal information, 
              except where we are required to retain it for legal purposes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">12. Changes to This Privacy Policy</h2>
            <p className="leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on 
              this page and updating the &quot;Last updated&quot; date. You are advised to review this Privacy Policy periodically for any changes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-[#8B5CF6]-300">13. Contact Us</h2>
            <p className="leading-relaxed">
              If you have any questions about this Privacy Policy or our privacy practices, please contact us through the contact information 
              provided on our website.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

