import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // contracts/ is a separate Hardhat project with its own toolchain and
    // its own lint concerns (Solidity, not this ESLint config); its
    // build artifacts in particular are generated, not authored.
    "contracts/**",
    // Fetched at test/script-run time, never authored here.
    ".cache/**",
  ]),
  {
    files: ["types/anon-aadhaar-core-shim.d.ts"],
    rules: {
      // The whole point of this file is untyped compile-time-only shims
      // for a third-party package's broken "types" entry point -- see the
      // file's own header comment.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
