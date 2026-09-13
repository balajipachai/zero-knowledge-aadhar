import { z } from "zod";

/** Strict: unknown keys are rejected outright. This is what stops a client
 * from smuggling any raw-Aadhaar-shaped field -- the ones only the
 * client-side SDK ever touches -- onto the recording path (TC6): there is
 * no field in this schema any of them could land in even if a client
 * tried. */
export const intakeDraftSchema = z
  .object({
    preferredName: z.string().trim().min(1).max(200),
    contactEmail: z.string().trim().email().max(320),
    college: z.string().trim().min(1).max(300),
    courseYear: z.string().trim().min(1).max(100),
    district: z.string().trim().min(1).max(100),
    firstGen: z.boolean(),
    statement: z.string().trim().min(1).max(4000),
  })
  .strict();

export type IntakeDraftInput = z.infer<typeof intakeDraftSchema>;

const groth16ProofSchema = z
  .object({
    pi_a: z.array(z.string()).length(3),
    pi_b: z.array(z.array(z.string()).length(2)).length(3),
    pi_c: z.array(z.string()).length(3),
    protocol: z.string(),
    curve: z.string(),
  })
  .strict();

const decimalString = z.string().regex(/^[0-9]+$/);

/** Mirrors `@anon-aadhaar/core`'s `AnonAadhaarProof` shape exactly, and
 * nothing more -- there is deliberately no `valid`/`status` field anywhere
 * in this schema. Whether the proof is valid is decided solely by
 * `verifyGroth16Proof` server-side; the client cannot assert it. */
const anonAadhaarProofSchema = z
  .object({
    groth16Proof: groth16ProofSchema,
    pubkeyHash: decimalString,
    timestamp: decimalString,
    nullifierSeed: decimalString,
    nullifier: decimalString,
    signalHash: decimalString,
    ageAbove18: decimalString,
    gender: decimalString,
    pincode: decimalString,
    state: decimalString,
  })
  .strict();

export const submitApplicationSchema = z
  .object({
    applicationId: z.string().uuid(),
    proof: anonAadhaarProofSchema,
  })
  .strict();

export type SubmitApplicationInput = z.infer<typeof submitApplicationSchema>;
