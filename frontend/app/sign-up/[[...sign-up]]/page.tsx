import { SignUp } from '@clerk/nextjs';
import Link from 'next/link';

const hasUsableClerkKey = () => {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  return Boolean(
    key &&
      key.startsWith('pk_') &&
      key.length >= 20 &&
      key.length <= 200 &&
      /^pk_[a-zA-Z0-9_\-=.]+$/.test(key)
  );
};

export default function SignUpPage() {
  if (!hasUsableClerkKey()) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-lg bg-white p-6 text-center shadow-lg">
          <h1 className="text-xl font-semibold text-gray-900">Sign up is temporarily unavailable</h1>
          <p className="mt-3 text-sm text-gray-600">
            Authentication is not configured for this deployment. Please try again later.
          </p>
          <Link href="/" className="mt-5 inline-flex rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full max-w-md">
        <SignUp
          appearance={{
            elements: {
              rootBox: "mx-auto",
              card: "shadow-lg rounded-lg",
              formButtonPrimary: "bg-[#6c47ff] hover:bg-[#5a3ae6] text-white",
            }
          }}
          routing="path"
          path="/sign-up"
          fallbackRedirectUrl="/"
          signInUrl="/sign-in"
        />
      </div>
    </div>
  );
}
