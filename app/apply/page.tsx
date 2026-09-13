import { ApplyPageClient } from "./ApplyPageClient";

export const metadata = {
  title: "Apply — Vidarbha First-Gen Grant",
};

export default function ApplyPage() {
  return (
    <main className="flex-1 px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Apply for this cycle</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Fill in your details, then prove your eligibility with your
            Aadhaar QR.
          </p>
        </div>
        <ApplyPageClient />
      </div>
    </main>
  );
}
