import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 sm:px-6">
      <div className="w-full max-w-2xl space-y-8 text-center">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Vidarbha First-Generation Grant
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Prove you&apos;re eligible. Not who you are.
          </h1>
          <p className="mx-auto max-w-xl text-base text-slate-600 dark:text-slate-300">
            This cycle&apos;s application uses your Aadhaar QR to prove, with a
            zero-knowledge proof generated entirely on your own device, that
            you are an adult and that you haven&apos;t already applied. Your
            Aadhaar number, name, date of birth and photo never leave your
            phone or browser.
          </p>
        </div>

        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/apply"
            className="w-full rounded-lg bg-slate-900 px-6 py-3 text-center font-semibold text-white shadow-sm transition hover:bg-slate-700 sm:w-auto dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Start your application
          </Link>
          <Link
            href="/volunteer/login"
            className="w-full rounded-lg border border-slate-300 px-6 py-3 text-center font-semibold text-slate-700 transition hover:bg-slate-100 sm:w-auto dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Volunteer sign in
          </Link>
        </div>

        <dl className="grid grid-cols-1 gap-4 pt-8 text-left sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <dt className="text-sm font-semibold">1. Scan your QR</dt>
            <dd className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Upload your Aadhaar QR image. It is read and proved locally in
              your browser.
            </dd>
          </div>
          <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <dt className="text-sm font-semibold">2. We check the proof</dt>
            <dd className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Our server verifies the proof itself and confirms you
              haven&apos;t already claimed a slot this cycle.
            </dd>
          </div>
          <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <dt className="text-sm font-semibold">3. One slot, ever</dt>
            <dd className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              A second attempt from the same person goes nowhere this cycle
              — no Aadhaar number is ever stored.
            </dd>
          </div>
        </dl>
      </div>
    </main>
  );
}
