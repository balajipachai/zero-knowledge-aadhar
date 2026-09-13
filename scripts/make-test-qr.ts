#!/usr/bin/env tsx
/**
 * Generates test Aadhaar QR code images for manually exercising the
 * applicant flow in a browser (upload one of these into the
 * LogInWithAnonAadhaar widget running in test mode).
 *
 * Writes .cache/test-qrs/adult.png and .cache/test-qrs/minor.png --
 * gitignored; never commit a generated QR image or the fixtures it's built
 * from.
 *
 * Usage: npm run make-test-qr
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { buildTestQrData } from "./lib/testFixtures";

async function main() {
  const outDir = path.join(process.cwd(), ".cache", "test-qrs");
  await mkdir(outDir, { recursive: true });

  const variants: { name: string; overrides: Parameters<typeof buildTestQrData>[0] }[] = [
    { name: "adult", overrides: {} },
    { name: "minor", overrides: { dob: "01-01-2015" } },
  ];

  for (const variant of variants) {
    console.log(`building ${variant.name} test QR data...`);
    const qrData = await buildTestQrData(variant.overrides);
    const dest = path.join(outDir, `${variant.name}.png`);
    await QRCode.toFile(dest, qrData, {
      errorCorrectionLevel: "L",
      margin: 2,
      width: 1024,
    });
    console.log(`wrote ${dest}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
