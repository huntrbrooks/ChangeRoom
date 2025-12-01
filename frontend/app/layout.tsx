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

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Change Room - Virtual Try-On & Shopping",
  description: "Try on clothes virtually and discover similar products to shop. Upload your photo and wardrobe items to see how they look on you.",
  icons: {
    icon: '/Logo.png',
    shortcut: '/Logo.png',
    apple: '/Logo.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#ffffff',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // During build, Clerk keys might not be available or invalid
  const rawKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const isBuildTime = process.env.NODE_ENV === 'production' && !process.env.VERCEL_ENV;
  
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
  
  // If key is invalid or missing, skip ClerkProvider entirely (especially during build)
  // This prevents build failures from invalid Clerk keys
  if (!hasValidKey || !publishableKey) {
    return (
      <html lang="en">
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#FAF9F6] text-black flex flex-col min-h-screen`}>
          <header className="flex justify-end items-center p-4 gap-4 h-16 bg-[#FAF9F6] border-b border-[#FF13F0]/20">
            {/* Clerk components unavailable - invalid or missing key */}
          </header>
          <div className="flex-1">
            {children}
          </div>
          <Footer />
        </body>
      </html>
    );
  }
  
  return (
    <ClerkProvider 
      publishableKey={publishableKey}
      appearance={{
        elements: {
          formButtonPrimary: 'bg-[#FF13F0] hover:bg-[#FF13F0]/90 text-white',
        }
      }}
    >
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#FAF9F6] text-black flex flex-col min-h-screen`}
        >
          <header className="flex justify-end items-center p-4 gap-4 h-16 bg-[#FAF9F6] border-b border-[#FF13F0]/20">
            <SignedOut>
              <SignInButton />
              <SignUpButton>
                <button className="bg-[#FF13F0] text-white rounded-full font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 cursor-pointer hover:bg-[#FF13F0]/90 transition-colors shadow-[0_0_15px_rgba(255,19,240,0.3)]">
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
        </body>
      </html>
    </ClerkProvider>
  );
}
