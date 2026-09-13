# Problem Statement:

Kavita runs a small education grant out of a two-room office in Nagpur — ₹15,000 a year to first-generation college students across Vidarbha. Last cycle she received 4,200 applications for 60 grants. Her volunteers found the same person applying eleven times under different email addresses, a WhatsApp group coaching people on how to farm the form, and a few dozen entries that were plainly scripted.

The obvious fix is to ask for an Aadhaar number. Kavita refuses. The moment that spreadsheet exists it is a liability she cannot defend, and a good share of her applicants would walk away rather than hand it over. They would be right to.

What she actually needs is much narrower than an identity. For each application she needs the answer to one question: is this a real adult person, and have I already seen them this cycle? Not a name. Not a number. Not a face.

# Tech Stack

- Anon Aadhaar SDK
- Next.js
- TypeScript
- Solidity
- Hardhat
- Postgres
- Sepolia Testnet

# Learnings

1. How a zero-knowledge proof over a government-signed document lets an app learn a predicate instead of a person; what a nullifier is for, and how it quietly stops being one if you get its seed wrong; and why where you verify decides whether verification means anything at all. 


# What to do:

1. Let an applicant establish eligibility from their Aadhaar QR without your app ever learning who they are.
2. Make the application intake treat that as the entry ticket — you decide what gets checked before anything is recorded.
3. Make a second application from the same human go nowhere this cycle.
4. Give Kavita's volunteers a view of the cycle they can actually work from: verified entries, duplicates turned away, what's left to review.

# Output

- Deliverable. A repo with the applicant flow, the verification path, and the record of who has already taken a slot — plus a README a volunteer could follow to run a cycle end to end.
- Create an overall learnings document at the end and add about specifically around the anon aadhar sdk, how it enables this feature and works end to end.

# Acceptance Criteria:

- An eligible applicant gets exactly one application per cycle, and Kavita's office never holds an Aadhaar number.

# Test Cases:

1. One claim per human enforced by a stored nullifier - 18 pts
Passes if Before an application is recorded, the code looks up the proof's nullifier in persistent state and rejects the request when that nullifier is already present.
Fails if No nullifier value is persisted anywhere in the repo; or it is persisted but never read before recording; or duplicate prevention is keyed on something a person can change at will — email, wallet address, session, device or IP — rather than the nullifier.

2. Nullifier seed fixed by the application rather than supplied by the caller - 14 pts
Passes if The seed used at the verification site comes from a value fixed in application code — constant, environment variable, or immutable contract state — and any seed arriving from the client is compared against it rather than trusted.
Fails if The seed used at verification is taken from client input, request parameters or URL state without comparison against a fixed value; or no seed value appears at the verification site at all.

3. Proof verified on a side the applicant does not control - 12 pts
Passes if The server route or contract function that records the application performs the proof verification itself before recording.
Fails if Acceptance depends on a validity flag, status field or proof-result object sent from the browser; or there is no verification call anywhere on the recording path.

4. Eligibility decided from the proof's revealed outputs - 10 pts
Passes if The eligibility branch compares values taken from the verified proof's revealed outputs or public signals.
Fails if The eligibility branch reads from a form field, profile record, cookie or client payload; or no eligibility condition exists anywhere in the recording path.

5. Signal bound to the specific application - 8 pts
Passes if At verification the signal carried by the proof is compared against a value the application derives for this specific application or recipient.
Fails if The signal is a constant, zero, or an arbitrary string that is never compared at verification; or no signal comparison appears anywhere on the verification path.

6. Raw Aadhaar data never leaves the applicant's device - 8 pts
Passes if No tracked code path transmits or persists the QR data, the certificate, or decoded personal fields from the card — proving inputs stay on the client. (The pass condition is an absence and is exhaustive by inspection: either such a path appears in the repo or none does.)
Fails if Any tracked code path posts the QR data or its decoded personal fields to a server, writes them to storage, or emits them to a log or analytics sink.

7. Proof generation runs in the applicant flow - 5 pts
Passes if Applicant-facing code calls an Anon Aadhaar proving entry point with input the applicant provides.
Fails if No Anon Aadhaar package is imported in the applicant flow; or proofs are hardcoded, mocked, or read from committed fixtures with no generation path.

8. No credential appears in any tracked file - 5 pts
Passes if No credential, key, or authenticated URL appears in any tracked file; secrets are referenced through environment variables with an example file carrying placeholders only.
Fails if Any tracked file contains a private key, mnemonic, API key, password, or a URL with an embedded credential — including ones marked as test or throwaway.


# Important

- For smart contracts refer /Users/iamthebatman/Desktop/github.com/balajipachai/solidity-dev-skill
- Run Anon Aadhaar on localhost mode
    - Zk artifacts that helps in verification purposes are downloaded and stored in ./public directory
    - [How it works?](https://documentation.anon-aadhaar.pse.dev/docs/how-does-it-work)
    - [Quick setup](https://documentation.anon-aadhaar.pse.dev/docs/quick-setup)
    - [Install the Solidity verifier](https://documentation.anon-aadhaar.pse.dev/docs/install-solidity-verifier)
    - [Proofs](https://documentation.anon-aadhaar.pse.dev/docs/proof)
    - [Signal](https://documentation.anon-aadhaar.pse.dev/docs/signal)
    - [Nullifier](https://documentation.anon-aadhaar.pse.dev/docs/nullifiers)
    - [Anon DigiLocker](https://documentation.anon-aadhaar.pse.dev/docs/anon-digilocker) - can this be used if at all we need to go to production ?
- If anything still not clear regarding anon-aadhar from the above links only then go to [anon-aadhar-gh-repo](https://github.com/anon-aadhaar/anon-aadhaar)
- If at te end anything worth updating in solidity-dev-skill, update that
- Make logical commits at the end and push to at the end after all the testing
- Treat this to be a production app, and it should not have any loose ends (if you need clarification then ask)

```bash
git remote add origin git@github.com:balajipachai/zero-knowledge-aadhar.git
git branch -M main
git push -u origin main
```

# Future Enhancements (Out of Scope for now)

- We can use Privy to give users web2 feel on web3 without having to maintain a seed phrase complexity.

