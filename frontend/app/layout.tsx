import type { Metadata, Viewport } from "next";
import { ClerkProvider } from '@clerk/nextjs';
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthHeader } from "./components/AuthHeader";
import { Footer } from "./components/Footer";
import { GoogleTagManagerBody, GoogleTagManagerHead } from "./components/GoogleTagManager";
import PwaRegister from "./components/PwaRegister";
import { PostHogClientProvider } from "./providers/PostHogProvider";
import { AnalyticsUserSync } from "./components/AnalyticsUserSync";
import { GlobalErrorGuards } from "./components/GlobalErrorGuards";
import { PageViewTracker } from "./components/PageViewTracker";
import { CANONICAL_ORIGIN } from "@/lib/domainRouting";
import { getAllowedRedirectOrigins } from "@/lib/clerkAuthConfig";
import { getClerkPublishableKey } from "@/lib/clerk-public-config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://igetdressed.online"),
  applicationName: "IGetDressed.Online",
  title: "IGetDressed.Online - Virtual Try-On & Shopping",
  description:
    "Try on clothes virtually and discover similar products to shop. Upload your photo and wardrobe items to see how they look on you.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/pwa/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/pwa/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/pwa/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/pwa/favicon.ico",
    apple: [
      {
        url: "/pwa/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "IGetDressed.Online",
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#000000',
  viewportFit: 'cover', // For notched devices
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const _isBuildTime = process.env.NODE_ENV === 'production' && !process.env.VERCEL_ENV;
  const publishableKey = getClerkPublishableKey();
  
  const statusMessage = process.env.NEXT_PUBLIC_STATUS_BANNER;
  const allowedRedirectOrigins = getAllowedRedirectOrigins();

  // If key is invalid or missing, skip ClerkProvider entirely (especially during build)
  // This prevents build failures from invalid Clerk keys
  if (!publishableKey) {
    return (
      <html lang="en">
        <head>
          <GoogleTagManagerHead />
        </head>
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#f7f8fb] text-[#101114] flex flex-col min-h-screen`}>
          <GoogleTagManagerBody />
          <PwaRegister />
          <GlobalErrorGuards />
          <PostHogClientProvider>
            <PageViewTracker />
            {statusMessage && (
              <div className="w-full bg-yellow-300 text-black text-center py-2 text-sm font-semibold border-b border-yellow-700">
                {statusMessage}
              </div>
            )}
            <div className="flex-1">
              {children}
            </div>
            <Footer />
          </PostHogClientProvider>
        </body>
      </html>
    );
  }

  return (
    <ClerkProvider 
      publishableKey={publishableKey}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      allowedRedirectOrigins={allowedRedirectOrigins}
      afterSignOutUrl={CANONICAL_ORIGIN}
      appearance={{
        elements: {
          formButtonPrimary: 'bg-black hover:bg-gray-900 text-white font-semibold',
        }
      }}
    >
      <html lang="en">
        <head>
          <GoogleTagManagerHead />
        </head>
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#f7f8fb] text-[#101114] flex flex-col min-h-screen`}
        >
          <GoogleTagManagerBody />
          <PwaRegister />
          <GlobalErrorGuards />
          <PostHogClientProvider>
            <AnalyticsUserSync />
            <PageViewTracker />
            {statusMessage && (
              <div className="w-full bg-yellow-300 text-black text-center py-2 text-sm font-semibold border-b border-yellow-700">
                {statusMessage}
              </div>
            )}
            <AuthHeader />
            <div className="flex-1">
              {children}
            </div>
            <Footer />
          </PostHogClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
