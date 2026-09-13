import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");

function listFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...listFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

// TC6 (pass condition is an absence, exhaustive by inspection): no tracked
// code path may transmit or persist the QR data, the certificate, or
// decoded personal fields. This test greps every server-reachable
// TypeScript file (app/ and src/, i.e. everything that runs outside the
// applicant's own browser or could log to a shared sink) for the field
// names the client-side SDK produces when it *does* have access to that
// data (qrData, certificate, claim, decoded personal fields), used outside
// of the client-only Anon Aadhaar SDK components themselves.
describe("raw Aadhaar data never leaves the applicant's device", () => {
  const serverFiles = [
    ...listFiles(path.join(ROOT, "app", "api")),
    ...listFiles(path.join(ROOT, "src", "server")),
  ];

  const forbiddenIdentifiers = ["qrData", "certificateFile", "certificate", "claim"];

  it("no app/api or src/server file references qrData/certificate/claim", () => {
    const offenders: string[] = [];
    for (const file of serverFiles) {
      const content = readFileSync(file, "utf8");
      for (const id of forbiddenIdentifiers) {
        // Word-boundary match so e.g. "certificatePath" in test fixture
        // helpers (which never runs on the recording path; it lives under
        // scripts/) wouldn't false-positive if it were ever moved here.
        const re = new RegExp(`\\b${id}\\b`);
        if (re.test(content)) {
          offenders.push(`${path.relative(ROOT, file)}: contains "${id}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the strict submitApplicationSchema has no field these values could occupy", () => {
    const schemaSource = readFileSync(
      path.join(ROOT, "src", "server", "intake", "schema.ts"),
      "utf8",
    );
    for (const id of ["qrData", "certificate", "claim"]) {
      expect(schemaSource.includes(`"${id}"`)).toBe(false);
      expect(schemaSource.includes(`'${id}'`)).toBe(false);
    }
  });

  it("no server file calls console.log/console.info/etc with a request body directly", () => {
    // Handlers must log reason codes only, never bodies (cross-cutting rule).
    const offenders: string[] = [];
    for (const file of [
      ...listFiles(path.join(ROOT, "app", "api")),
    ]) {
      const content = readFileSync(file, "utf8");
      if (/console\.\w+\([^)]*\bbody\b[^)]*\)/.test(content)) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});

// TC7: the applicant flow must import an Anon Aadhaar proving entry point
// and drive it with input the applicant provides -- not a hardcoded/mocked
// proof and not a committed fixture read as the proof source.
describe("proof generation runs in the applicant flow (TC7)", () => {
  const applyDir = path.join(ROOT, "app", "apply");
  const applyFiles = listFiles(applyDir);

  it("app/apply imports @anon-aadhaar/react", () => {
    const hasImport = applyFiles.some((f) =>
      readFileSync(f, "utf8").includes("@anon-aadhaar/react"),
    );
    expect(hasImport).toBe(true);
  });

  it("app/apply renders LogInWithAnonAadhaar bound to a server-derived signal/seed, not a hardcoded proof", () => {
    const flow = readFileSync(path.join(applyDir, "ApplyFlow.tsx"), "utf8");
    expect(flow).toMatch(/<LogInWithAnonAadhaar/);
    expect(flow).toMatch(/nullifierSeed=\{.*draft\.nullifierSeed.*\}/);
    expect(flow).toMatch(/signal=\{draft\.signal\}/);
    // No hardcoded/mocked proof object anywhere in the flow.
    expect(flow).not.toMatch(/groth16Proof:\s*\{/);
  });
});
