// Instant skeleton for sign-in / sign-up / password reset.
//
// A form that takes a moment to appear reads as a broken link, and this is the
// one screen where that costs a signup.
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 animate-pulse">
      <div className="w-full max-w-md space-y-5">
        <div className="mx-auto h-12 w-12 rounded-xl bg-gray-800" />
        <div className="mx-auto h-6 w-40 rounded bg-gray-800" />
        <div className="space-y-3">
          <div className="h-11 w-full rounded-lg bg-gray-800/70" />
          <div className="h-11 w-full rounded-lg bg-gray-800/70" />
          <div className="h-11 w-full rounded-lg bg-gray-800" />
        </div>
      </div>
    </div>
  );
}
