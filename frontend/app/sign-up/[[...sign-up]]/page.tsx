import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
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
          routing="hash"
          fallbackRedirectUrl="/"
          signInUrl="/sign-in"
        />
      </div>
    </div>
  );
}

