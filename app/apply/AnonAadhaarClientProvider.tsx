"use client";

import { AnonAadhaarProvider } from "@anon-aadhaar/react";
import type { ReactNode } from "react";

const useTestAadhaar = process.env.NEXT_PUBLIC_ANON_AADHAAR_MODE !== "production";

/**
 * Wraps the applicant flow with the Anon Aadhaar SDK's context provider,
 * pointed at the artifacts we serve ourselves from /public (fetched by
 * scripts/fetch-zk-artifacts.sh, never committed -- see that script for the
 * pinned size + sha256 check). Everything downstream of this provider runs
 * entirely in the browser: the QR is scanned, the witness is built and the
 * groth16 proof is generated on the applicant's own device. Nothing here
 * ever calls out to our server with the QR data.
 */
export function AnonAadhaarClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AnonAadhaarProvider
      _appName="Vidarbha First-Gen Grant"
      _useTestAadhaar={useTestAadhaar}
      _artifactslinks={{
        zkey_url: "/circuit_final.zkey",
        wasm_url: "/aadhaar-verifier.wasm",
        vkey_url: "/vkey.json",
      }}
    >
      {children}
    </AnonAadhaarProvider>
  );
}
