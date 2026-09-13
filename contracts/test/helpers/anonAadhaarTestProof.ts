/**
 * Self-contained helper (kept local to contracts/, mirrors
 * ../../scripts/lib/testFixtures.ts + generateProof.ts in the Next app --
 * the two are separate npm packages with separate node_modules, so this is
 * duplicated rather than cross-imported across package boundaries) that
 * downloads upstream's own test signing material and uses it to generate a
 * REAL groth16 proof for the real Verifier + AnonAadhaar + GrantCycleRegistry
 * deployed in this test, entirely in Node.
 *
 * `.cache/` is gitignored; nothing here is ever committed (graded test
 * case 8). The commit + sha256 pins are identical to the root project's
 * copy -- same upstream files, same trust anchor.
 */
import { createHash, createSign } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ArtifactsOrigin,
  convertBigIntToByteArray,
  createCustomV2TestData,
  decompressByteArray,
  generateArgs,
  init,
  prove,
  rawDataToCompressedQR,
} from "@anon-aadhaar/core";
import { withProofCache } from "./proofCache";

const REPO = "anon-aadhaar/anon-aadhaar";
const PINNED_COMMIT = "4dad918761cfb1d7d5ed9918dcd796d0cb23ae82";
const CACHE_DIR = path.join(process.cwd(), ".cache", "anon-aadhaar-fixtures", PINNED_COMMIT);

const FIXTURE_FILES = [
  {
    repoPath: "packages/circuits/assets/testCertificate.pem",
    localName: "testCertificate.pem",
    sha256: "a025f6e83f50885299d91a881ab667fe08aa8206062ea560e81d06a59bfdaae6",
  },
  {
    repoPath: "packages/circuits/assets/testPrivateKey.pem",
    localName: "testPrivateKey.pem",
    sha256: "b442d1b4b4b848be9657c7dd984ddce8267a72e5e170d8bfcb8a9fd711403640",
  },
  {
    repoPath: "packages/circuits/scripts/generateTestData.ts",
    localName: "generateTestData.ts",
    sha256: "d1e474637a9bf79876a54ab3e64ca7c9b2b1933edfdb7354ff5491a3473f8ea4",
  },
] as const;

function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

async function fetchAndVerify(file: (typeof FIXTURE_FILES)[number]): Promise<string> {
  const dest = path.join(CACHE_DIR, file.localName);
  if (existsSync(dest)) {
    const existing = await readFile(dest);
    if (sha256Hex(existing) === file.sha256) return dest;
  }
  const url = `https://raw.githubusercontent.com/${REPO}/${PINNED_COMMIT}/${file.repoPath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const actual = sha256Hex(buf);
  if (actual !== file.sha256) {
    throw new Error(`sha256 mismatch for ${file.repoPath}: got ${actual}, expected ${file.sha256}`);
  }
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(dest, buf);
  return dest;
}

async function ensureFixtures() {
  const [certificatePath, privateKeyPath, generateTestDataPath] = await Promise.all(
    FIXTURE_FILES.map(fetchAndVerify),
  );
  return { certificatePath, privateKeyPath, generateTestDataPath };
}

async function readBaseV1Data(generateTestDataPath: string): Promise<string> {
  const src = await readFile(generateTestDataPath, "utf8");
  const match = src.match(/const data =\s*\n?\s*'([0-9]+)'/);
  if (!match) throw new Error("could not locate base V1 test data constant");
  return match[1]!;
}

export type TestQrOverrides = {
  dob?: string;
  pincode?: string;
  gender?: string;
  state?: string;
};

let initialized = false;
async function ensureProverInit() {
  if (initialized) return;
  const root = path.join(process.cwd(), "..");
  await init({
    wasmURL: path.join(root, "public", "aadhaar-verifier.wasm"),
    zkeyURL: path.join(root, "public", "circuit_final.zkey"),
    vkeyURL: path.join(root, "public", "vkey.json"),
    artifactsOrigin: ArtifactsOrigin.local,
  });
  initialized = true;
}

/** Generates a real AnonAadhaarProof bound to the given nullifierSeed and
 * signal (both decimal strings), optionally with a modified dob/etc. */
export async function generateRealTestProof(params: {
  nullifierSeed: string | bigint;
  signal: string;
  overrides?: TestQrOverrides;
}) {
  return withProofCache(
    { nullifierSeed: params.nullifierSeed, signal: params.signal, overrides: params.overrides },
    async () => {
      await ensureProverInit();
      const { certificatePath, privateKeyPath, generateTestDataPath } = await ensureFixtures();

      const baseData = await readBaseV1Data(generateTestDataPath);
      const privateKey = await readFile(privateKeyPath, "utf8");
      const certificate = await readFile(certificatePath, "utf8");

      const qrBytes = convertBigIntToByteArray(BigInt(baseData));
      const decoded = decompressByteArray(qrBytes);
      const signedData = decoded.slice(0, decoded.length - 256);

      const newSignedData = createCustomV2TestData({
        signedData,
        ...params.overrides,
      });

      const sign = createSign("sha256");
      sign.update(Buffer.from(newSignedData));
      sign.end();
      const signature = sign.sign({ key: privateKey });

      const full = Buffer.concat([Buffer.from(newSignedData), signature]);
      const qrData = rawDataToCompressedQR(full).toString();

      const args = await generateArgs({
        qrData,
        certificateFile: certificate,
        nullifierSeed: params.nullifierSeed,
        fieldsToRevealArray: ["revealAgeAbove18"],
        signal: params.signal,
      });

      const pcd = await prove(args);
      return pcd.proof;
    },
  );
}
