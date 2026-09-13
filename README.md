# Zero-Knowledge Aadhaar Grant Intake

Grant intake where each applicant proves, with an Anon Aadhaar zero-knowledge
proof generated on their own device, that they are a real adult who hasn't
already applied this cycle. The office never sees or stores an Aadhaar number,
name, photo or QR payload.

- **Applicant flow** (`/apply`): fill in the application, scan the Aadhaar QR,
  and generate the proof in the browser. Only the proof is sent.
- **Verification path** (`app/api/applications` → `src/server/intake/submit.ts`):
  the server verifies the Groth16 proof, checks the nullifier seed, signal,
  public key hash, and the proof's `ageAbove18` output, then relays it to
  `GrantCycleRegistry`, which verifies it again on-chain and records the
  nullifier.
- **Volunteer view** (`/volunteer/dashboard`): verified entries, duplicates
  turned away, what's left to review; shortlist, reject or award.

## Prerequisites

- Node.js 24, Postgres running locally
- `npm install` in the repo root and in `contracts/`

## Run a cycle locally

```bash
bash scripts/fetch-zk-artifacts.sh    # zkey/wasm/vkey into public/ (not committed)
cp .env.example .env.local            # then fill in values (see comments in the file)
npm run migrate                       # create the Postgres schema
npm run dev:setup                     # local chain: deploy registry, write relayer key to .env.local
npm run volunteer:add                 # create a volunteer login
npm run dev                           # http://localhost:3010
```

- Applicants go to `/apply`. In `ANON_AADHAAR_MODE=test`, `npm run make-test-qr`
  generates synthetic adult/minor test QRs.
- Volunteers sign in at `/volunteer/login` and work from the dashboard.
- Housekeeping: `npm run cleanup` (purge stale drafts, rate limits and sessions),
  `npm run reconcile-anchors` (retry applications not yet anchored on-chain).

## Sepolia deployment (cycle `2026-h2`)

All three contracts are source-verified on Etherscan and are an exact match on
[Sourcify](https://repo.sourcify.dev/11155111/0xC149039F93fE704190586f02bf3e855945AEE8E3).

| Contract | Address | Source |
|---|---|---|
| `GrantCycleRegistry` | [`0xC149039F93fE704190586f02bf3e855945AEE8E3`](https://sepolia.etherscan.io/address/0xC149039F93fE704190586f02bf3e855945AEE8E3) | [Verified](https://sepolia.etherscan.io/address/0xC149039F93fE704190586f02bf3e855945AEE8E3#code) |
| `AnonAadhaar` (`AnonAadhaarDeploy`) | [`0xAfF04bcdeaF32615b4e1A994DE687e3FD6a23696`](https://sepolia.etherscan.io/address/0xAfF04bcdeaF32615b4e1A994DE687e3FD6a23696) | [Verified](https://sepolia.etherscan.io/address/0xAfF04bcdeaF32615b4e1A994DE687e3FD6a23696#code) |
| Groth16 verifier (`VerifierDeploy`) | [`0xA0A5bDb07cD91411D937a43Cf2C113A41e308817`](https://sepolia.etherscan.io/address/0xA0A5bDb07cD91411D937a43Cf2C113A41e308817) | [Verified](https://sepolia.etherscan.io/address/0xA0A5bDb07cD91411D937a43Cf2C113A41e308817#code) |

To point the app at it, set in `.env.local`: `CHAIN_ID=11155111`, your
`RPC_URL`, `REGISTRY_ADDRESS=0xC149039F93fE704190586f02bf3e855945AEE8E3`, and
the same `CYCLE_ID`, `NULLIFIER_SEED` and relayer key the registry was deployed
with. The server compares these with the contract at startup and refuses
applications if any differ.

To deploy a new cycle, fill in `contracts/ignition/parameters.sepolia.json`
from `parameters.example.json` with a fresh seed and window, then run
`npx hardhat ignition deploy ignition/modules/GrantCycle.ts --network sepolia --parameters ignition/parameters.sepolia.json`
from `contracts/`.

## Tests

```bash
npm test                  # secrets scan + unit + integration (real proofs, next build/start, Hardhat node)
cd contracts && npx hardhat test
```

Integration tests use `TEST_DATABASE_URL` (default `postgresql://localhost:5432/zk_aadhaar_test`).

## Secrets

Never commit real values. `.env.local` is gitignored, `.env.example` carries
placeholders only, and `npm run check-secrets` scans tracked files.

See [LEARNINGS.md](LEARNINGS.md) for how Anon Aadhaar makes this work.
