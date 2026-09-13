import { describe, expect, it } from "vitest";
import {
  intakeDraftSchema,
  submitApplicationSchema,
} from "@/src/server/intake/schema";

const validProof = {
  groth16Proof: {
    pi_a: ["1", "2", "3"],
    pi_b: [
      ["1", "2"],
      ["3", "4"],
      ["5", "6"],
    ],
    pi_c: ["1", "2", "3"],
    protocol: "groth16",
    curve: "bn128",
  },
  pubkeyHash: "123",
  timestamp: "123",
  nullifierSeed: "123",
  nullifier: "123",
  signalHash: "123",
  ageAbove18: "1",
  gender: "0",
  pincode: "0",
  state: "0",
};

describe("submitApplicationSchema", () => {
  it("accepts a well-formed body", () => {
    const result = submitApplicationSchema.safeParse({
      applicationId: "11111111-1111-1111-1111-111111111111",
      proof: validProof,
    });
    expect(result.success).toBe(true);
  });

  // TC6: raw Aadhaar data (qrData, certificate, claim) must never be
  // acceptable on the recording path -- the strict schema has no field for
  // any of them to land in.
  it.each(["qrData", "certificate", "claim"])(
    "rejects a body carrying a top-level %s field",
    (extraKey) => {
      const result = submitApplicationSchema.safeParse({
        applicationId: "11111111-1111-1111-1111-111111111111",
        proof: validProof,
        [extraKey]: "leaked-data",
      });
      expect(result.success).toBe(false);
    },
  );

  it("rejects a proof object carrying an extra qrData/certificate/claim field", () => {
    const result = submitApplicationSchema.safeParse({
      applicationId: "11111111-1111-1111-1111-111111111111",
      proof: { ...validProof, qrData: "leaked", certificate: "leaked", claim: {} },
    });
    expect(result.success).toBe(false);
  });

  // TC3: acceptance must never depend on a client-supplied validity flag --
  // there is no field for one, and adding one is rejected outright.
  it.each(["valid", "isValid", "status", "verified"])(
    "rejects a body carrying a client validity flag (%s)",
    (flagKey) => {
      const result = submitApplicationSchema.safeParse({
        applicationId: "11111111-1111-1111-1111-111111111111",
        proof: validProof,
        [flagKey]: true,
      });
      expect(result.success).toBe(false);
    },
  );

  it("rejects a non-uuid applicationId", () => {
    const result = submitApplicationSchema.safeParse({
      applicationId: "not-a-uuid",
      proof: validProof,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-decimal-string proof fields", () => {
    const result = submitApplicationSchema.safeParse({
      applicationId: "11111111-1111-1111-1111-111111111111",
      proof: { ...validProof, nullifier: "0xabc" },
    });
    expect(result.success).toBe(false);
  });
});

describe("intakeDraftSchema", () => {
  const valid = {
    preferredName: "Asha",
    contactEmail: "asha@example.com",
    college: "Nagpur College",
    courseYear: "B.Sc 2nd year",
    district: "Nagpur",
    firstGen: true,
    statement: "This matters to me.",
  };

  it("accepts a well-formed draft", () => {
    expect(intakeDraftSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an unknown extra field", () => {
    expect(
      intakeDraftSchema.safeParse({ ...valid, aadhaarNumber: "1234" }).success,
    ).toBe(false);
  });

  it("rejects a missing required field", () => {
    const rest: Partial<typeof valid> = { ...valid };
    delete rest.firstGen;
    expect(intakeDraftSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(
      intakeDraftSchema.safeParse({ ...valid, contactEmail: "not-an-email" })
        .success,
    ).toBe(false);
  });
});
