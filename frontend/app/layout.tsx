import type { Metadata, Viewport } from "next";
import {
  ClerkProvider,
  UserButton,
} from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Footer } from "./components/Footer";
import { GoogleTagManagerBody, GoogleTagManagerHead } from "./components/GoogleTagManager";
import PwaRegister from "./components/PwaRegister";
import { PostHogClientProvider } from "./providers/PostHogProvider";
import { AnalyticsUserSync } from "./components/AnalyticsUserSync";
import { GlobalErrorGuards } from "./components/GlobalErrorGuards";
import { PageViewTracker } from "./components/PageViewTracker";
import Link from "next/link";
import { CANONICAL_ORIGIN } from "@/lib/domainRouting";
import { getAllowedRedirectOrigins } from "@/lib/clerkAuthConfig";

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
  // During build, Clerk keys might not be available or invalid
  const rawKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const _isBuildTime = process.env.NODE_ENV === 'production' && !process.env.VERCEL_ENV;
  
  // Clean and validate key - remove quotes, whitespace, and validate format
  // Handle cases where key might be wrapped in quotes or have trailing characters
  let publishableKey: string | undefined;
  if (rawKey) {
    // Remove any surrounding quotes and trim whitespace
    publishableKey = rawKey.trim().replace(/^['"]+|['"]+$/g, '').trim();
    // Remove any trailing invalid characters (like quotes, truncated keys)
    publishableKey = publishableKey.replace(/['"]/g, '').trim();
    // Remove any trailing characters that look like corruption (e.g., "JA" at the end)
    // Clerk keys should end with base64-like characters, not random letters
    publishableKey = publishableKey.replace(/[^a-zA-Z0-9_\-=.]$/, '').trim();
  }
  
  // Validate key format - must start with pk_, be at least 20 chars, and match Clerk key pattern
  // Clerk keys are base64-like strings, so they contain letters, numbers, underscores, dashes, equals, and dots
  // Valid format: pk_test_... or pk_live_... followed by base64-like string
  const hasValidKey = publishableKey && 
    publishableKey.startsWith('pk_') && 
    publishableKey.length >= 20 &&
    publishableKey.length <= 200 && // Reasonable max length
    !publishableKey.includes('"') && // No quotes anywhere (quotes indicate malformed env var)
    !publishableKey.includes("'") && // No single quotes anywhere
    /^pk_[a-zA-Z0-9_\-=.]+$/.test(publishableKey); // Allow dots, equals for base64 padding
  
  const statusMessage = process.env.NEXT_PUBLIC_STATUS_BANNER;
  const allowedRedirectOrigins = getAllowedRedirectOrigins();

  // If key is invalid or missing, skip ClerkProvider entirely (especially during build)
  // This prevents build failures from invalid Clerk keys
  if (!hasValidKey || !publishableKey) {
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

  let userId: string | null = null;
  try {
    const authResult = await auth();
    userId = authResult.userId;
  } catch {
    userId = null;
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
            <header className="flex justify-end items-center px-4 sm:px-6 py-3 gap-4 min-h-16 bg-white/90 backdrop-blur-md border-b border-slate-200">
              {!userId ? (
                <>
                  <Link
                    href="/sign-in"
                    className="text-xs sm:text-sm h-10 sm:h-11 px-4 sm:px-5 inline-flex items-center justify-center font-semibold text-slate-800 hover:text-black transition-colors"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/sign-up"
                    className="bg-[#101114] text-white rounded-lg font-semibold text-xs sm:text-sm h-10 sm:h-11 px-5 sm:px-6 inline-flex items-center justify-center hover:bg-[#20232a] transition-colors shadow-[0_10px_24px_rgba(16,17,20,0.16)]"
                  >
                    Sign Up
                  </Link>
                </>
              ) : (
                <UserButton />
              )}
            </header>
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
