import type { Metadata, Viewport } from "next";
import {
  ClerkProvider,
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from '@clerk/nextjs';
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Footer } from "./components/Footer";
import PwaRegister from "./components/PwaRegister";
import { PostHogClientProvider } from "./providers/PostHogProvider";
import { AnalyticsUserSync } from "./components/AnalyticsUserSync";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
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

export default function RootLayout({
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

  // If key is invalid or missing, skip ClerkProvider entirely (especially during build)
  // This prevents build failures from invalid Clerk keys
  if (!hasValidKey || !publishableKey) {
    return (
      <html lang="en">
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white text-black flex flex-col min-h-screen`}>
          <PwaRegister />
          <PostHogClientProvider>
            {statusMessage && (
              <div className="w-full bg-yellow-300 text-black text-center py-2 text-sm font-semibold border-b border-yellow-700">
                {statusMessage}
              </div>
            )}
            <header className="flex justify-end items-center p-4 gap-4 h-16 bg-white border-b border-black/10">
              {/* Clerk components unavailable - invalid or missing key */}
            </header>
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
      appearance={{
        elements: {
          formButtonPrimary: 'bg-black hover:bg-gray-900 text-white uppercase font-semibold tracking-wider',
        }
      }}
    >
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#FAF9F6] text-black flex flex-col min-h-screen`}
        >
          <PwaRegister />
          <PostHogClientProvider>
            <AnalyticsUserSync />
            {statusMessage && (
              <div className="w-full bg-yellow-300 text-black text-center py-2 text-sm font-semibold border-b border-yellow-700">
                {statusMessage}
              </div>
            )}
            <header className="flex justify-end items-center p-4 gap-4 h-16 bg-[#FAF9F6] border-b border-[#8B5CF6]/20">
              <SignedOut>
                <SignInButton />
                <SignUpButton>
                  <button className="bg-black text-white rounded-none font-semibold text-xs sm:text-sm h-10 sm:h-12 px-6 sm:px-8 cursor-pointer hover:bg-gray-900 transition-colors uppercase tracking-wider">
                    Sign Up
                  </button>
                </SignUpButton>
              </SignedOut>
              <SignedIn>
                <UserButton />
              </SignedIn>
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
