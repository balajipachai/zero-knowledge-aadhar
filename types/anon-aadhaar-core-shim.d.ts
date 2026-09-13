/**
 * Type-only shim for @anon-aadhaar/core@2.4.3, redirected to via this
 * project's tsconfig `paths` (see tsconfig.json: "@anon-aadhaar/core" ->
 * this file). Real module resolution at runtime is untouched -- Next/Node
 * still load the real `dist/index.js`; only `tsc`'s *type* resolution is
 * redirected here.
 *
 * Why: the package's own package.json sets `"types": "./src/index.ts"`
 * (a plain TS source file, not a compiled .d.ts), so without this
 * redirect `tsc` walks the package's entire source tree as part of our
 * own compilation and reports ITS internal type errors (its `prover.ts`
 * doesn't type-check cleanly against a modern @types/node's
 * ArrayBuffer/Buffer/Uint8Array types) as if they were ours.
 * `skipLibCheck` doesn't help: it only skips `.d.ts` files, and this
 * package's declared entry point is a `.ts` file. A plain
 * `declare module "@anon-aadhaar/core";` ambient shim does *not* work
 * either -- TypeScript prefers a real, resolvable module over a shorthand
 * ambient declaration, and this package's `types` field is (just barely)
 * resolvable. A hard `paths` redirect is the only reliable override.
 *
 * Every export here is intentionally untyped (`any`) -- this file exists
 * purely to stop tsc from reading upstream's source, not to provide real
 * type safety for this package. Exhaustive as of @anon-aadhaar/core@2.4.3
 * (see `node -e "console.log(Object.keys(require('@anon-aadhaar/core')))"`
 * to regenerate this list if the package is upgraded).
 */

export type AnonAadhaarCore = any;
export const AnonAadhaarCorePackage: any;
export const AnonAadhaarTypeName: any;
export const ArtifactsOrigin: any;
export const CIRCOM_FIELD_P: any;
export const artifactUrls: any;
export const compressByteArray: any;
export const convertBigIntToByteArray: any;
export const convertByteArrayToBigInt: any;
export const convertRevealBigIntToString: any;
export const createCustomV2TestData: any;
export const dateToUnixTimestamp: any;
export const decompressByteArray: any;
export const deserialize: any;
export const extractFieldByIndex: any;
export const extractPhoto: any;
export const fetchPublicKey: any;
export const fieldsLabel: any;
export const generateArgs: any;
export const getDisplayOptions: any;
export const getEndIndex: any;
export const getRandomBytes: any;
export const handleError: any;
export const hash: any;
export const init: any;
export const packGroth16Proof: any;
export const productionPublicKeyHash: string;
export const prove: any;
export const rawDataToCompressedQR: any;
export const readData: any;
export const replaceBytesBetween: any;
export const retrieveFileExtension: any;
export const returnFullId: any;
export const returnNewDateString: any;
export const searchZkeyChunks: any;
export const serialize: any;
export const splitToWords: any;
export const testCertificateUrl: string;
export const testPublicKeyHash: string;
export const timestampToUTCUnix: any;
export const verify: any;

export type AnonAadhaarProof = any;
export type AnonAadhaarClaim = any;
export type AnonAadhaarArgs = any;
export type InitArgs = any;
export type FieldsToRevealArray = string[];
export type ProverState = any;
