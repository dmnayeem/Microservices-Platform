// Instant skeleton for onboarding.
//
// /welcome runs a handle check before it renders, and it is the very first
// screen a new account sees — a hang here is the worst possible first impression.
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 animate-pulse">
      <div className="w-full max-w-lg space-y-5">
        <div className="h-7 w-56 rounded-lg bg-gray-800" />
        <div className="h-4 w-72 rounded bg-gray-800/70" />
        <div className="h-11 w-full rounded-lg bg-gray-800/70" />
        <div className="h-11 w-32 rounded-lg bg-gray-800" />
      </div>
    </div>
  );
}
