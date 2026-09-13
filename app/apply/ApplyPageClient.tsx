"use client";

import dynamic from "next/dynamic";

// The Anon Aadhaar SDK reads from IndexedDB/localForage, web workers and
// WASM -- none of which exist during server-side rendering. Loading it with
// ssr:false keeps the whole proving stack out of the server bundle and out
// of the initial HTML.
const AnonAadhaarClientProvider = dynamic(
  () => import("./AnonAadhaarClientProvider").then((m) => m.AnonAadhaarClientProvider),
  { ssr: false },
);
const ApplyFlow = dynamic(() => import("./ApplyFlow").then((m) => m.ApplyFlow), {
  ssr: false,
  loading: () => <p className="text-center text-sm text-slate-500">Loading…</p>,
});

export function ApplyPageClient() {
  return (
    <AnonAadhaarClientProvider>
      <ApplyFlow />
    </AnonAadhaarClientProvider>
  );
}
