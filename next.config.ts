import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // snarkjs has native-ish WASM/worker-thread internals that don't survive
  // bundling. @anon-aadhaar/core is deliberately NOT listed here: marking
  // it external caused Turbopack to replace our own
  // `createRequire(import.meta.url)("@anon-aadhaar/core")` calls (see
  // src/server/zk/verifyProof.ts) with a bare `{}`, silently turning every
  // named value `undefined` -- worse than plain bundling. Bundling it
  // normally, combined with `createRequire` in our own code (rather than a
  // static `import { x } from "@anon-aadhaar/core"`, which independently
  // resolved to `undefined` under Next's CJS/ESM interop for this
  // package's export shape), is what actually works.
  serverExternalPackages: ["snarkjs"],
  // Don't auto-generate AGENTS.md/CLAUDE.md -- this project's docs are
  // hand-written, not tool-generated.
  agentRules: false,

  async headers() {
    return [
      {
        // Global security headers on every response.
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // camera is self-allowed because the applicant flow's Anon
          // Aadhaar SDK widget scans a QR code with the device camera;
          // nothing on this site needs microphone or geolocation.
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
        ],
      },
      {
        // Volunteer dashboard pages carry PII-adjacent review data --
        // never let a shared/public machine's browser cache them.
        source: "/volunteer/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        // Every API response (draft/proof submission, volunteer session
        // data, review actions) is request-specific and must not be cached.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        // The applicant form itself, likewise.
        source: "/apply",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
