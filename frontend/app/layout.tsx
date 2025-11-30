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
  themeColor: '#000000',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // During build, Clerk keys might not be available
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const hasValidKey = publishableKey && publishableKey.startsWith('pk_') && publishableKey.length > 10;
  
  // If no valid key during build, render without ClerkProvider (will work at runtime)
  if (!hasValidKey) {
    return (
      <html lang="en">
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-black text-white`}>
          <header className="flex justify-end items-center p-4 gap-4 h-16 bg-black border-b border-cyan-500/20">
            {/* Clerk components won't work during build, but that's OK */}
          </header>
          {children}
        </body>
      </html>
    );
  }
  
  return (
    <ClerkProvider 
      publishableKey={publishableKey}
      appearance={{
        elements: {
          formButtonPrimary: 'bg-cyan-500 hover:bg-cyan-400 text-black',
        }
      }}
    >
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased bg-black text-white`}
        >
          <header className="flex justify-end items-center p-4 gap-4 h-16 bg-black border-b border-cyan-500/20">
            <SignedOut>
              <SignInButton />
              <SignUpButton>
                <button className="bg-cyan-500 text-black rounded-full font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 cursor-pointer hover:bg-cyan-400 transition-colors shadow-[0_0_15px_rgba(0,255,255,0.3)]">
                  Sign Up
                </button>
              </SignUpButton>
            </SignedOut>
            <SignedIn>
              <UserButton />
            </SignedIn>
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
