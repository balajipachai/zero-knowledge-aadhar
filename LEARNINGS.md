# Learnings: Anon Aadhaar end to end

## What Anon Aadhaar gives us

The Aadhaar secure QR is signed by UIDAI with RSA. Anon Aadhaar is a Circom
circuit that proves, in zero knowledge, "I hold a QR whose signature verifies
against UIDAI's public key", and reveals only chosen outputs. The app learns a
predicate (adult, not seen before), not a person.

## How it flows in this repo

1. **Prove on the device.** `app/apply` uses `@anon-aadhaar/react` /
   `@anon-aadhaar/core` to generate a Groth16 proof in the browser, with the
   zkey/wasm artifacts served from `public/`. The QR data, certificate and
   decoded fields never leave the device; only the proof and public signals are
   posted (enforced by `test/unit/rawAadhaarDataNeverLeavesDevice.test.ts`).
2. **Public signals that matter:**
   - `pubkeyHash`: hash of the RSA key that signed the QR. The server compares
     it against `testPublicKeyHash` or `productionPublicKeyHash` for the
     configured mode, never against a value the client sends.
   - `nullifier`: derived from the Aadhaar data plus a `nullifierSeed`. Same
     person + same seed = same nullifier, so it's a per-cycle "seen before"
     key that reveals nothing about who they are.
   - `ageAbove18` (and optionally gender/pincode/state): revealed fields. We
     request only `ageAbove18` and reject proofs that reveal more.
   - `signal`: arbitrary data bound into the proof. We bind it to the specific
     application id, so a proof can't be replayed onto another application.
3. **Verify where the applicant has no control.** `src/server/intake/submit.ts`
   verifies the proof server-side (snarkjs + `vkey.json`), checks the seed,
   signal, pubkey hash and `ageAbove18`, looks up the nullifier, and only then
   records. `GrantCycleRegistry.sol` verifies the same proof again on-chain via
   the Anon Aadhaar verifier and stores the nullifier permanently.

## Lessons

- **The seed must be fixed by the app.** If the caller could pick
  `nullifierSeed`, they could get a fresh nullifier every time and apply
  endlessly. It comes from env config and immutable contract state, and a seed
  sent by the client is compared against it, never trusted.
- **Rotate the seed per cycle.** A new seed means a new nullifier space: people
  can apply again next cycle, but not twice in one.
- **Verification only counts on the recording path.** A "valid: true" flag from
  the browser means nothing; the route that writes the record must verify.
- **Bundling gotcha:** `@anon-aadhaar/core` is a CJS bundle. Under Turbopack's
  production build a literal `createRequire(...)("@anon-aadhaar/core")` was
  rewritten to `{}`, which silently made `testPublicKeyHash` `undefined` and
  failed the boot check. Server code now loads it only through
  `src/server/zk/anonAadhaarCoreRuntime.ts`.
- **Test mode vs production:** test mode uses the SDK's test signing key and
  synthetic QRs; production needs real UIDAI-signed QRs and
  `productionPublicKeyHash`.
