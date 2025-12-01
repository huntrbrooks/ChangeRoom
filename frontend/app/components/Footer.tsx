import React from 'react';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-cyan-500/20 bg-black text-gray-400 py-8 mt-auto">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-sm">
            <p>&copy; {new Date().getFullYear()} Change Room. All rights reserved.</p>
          </div>
          <nav className="flex flex-wrap justify-center gap-6 text-sm">
            <Link 
              href="/terms-of-service" 
              className="hover:text-cyan-400 transition-colors"
            >
              Terms of Service
            </Link>
            <Link 
              href="/privacy-policy" 
              className="hover:text-cyan-400 transition-colors"
            >
              Privacy Policy
            </Link>
            <Link 
              href="/about" 
              className="hover:text-cyan-400 transition-colors"
            >
              About
            </Link>
            <Link 
              href="/how-it-works" 
              className="hover:text-cyan-400 transition-colors"
            >
              How it Works
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}

