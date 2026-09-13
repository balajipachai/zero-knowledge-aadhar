import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

// TC8: no credential appears in any tracked file. This just runs the same
// script the "npm run check-secrets" / final CI gate runs, so a regression
// here shows up in `npm run test:unit` too, not only in a separate manual
// step.
describe("check-secrets.sh", () => {
  it("passes against the current working tree", () => {
    const scriptPath = path.resolve(__dirname, "..", "..", "scripts", "check-secrets.sh");
    expect(() => execFileSync("bash", [scriptPath], { stdio: "pipe" })).not.toThrow();
  });
});
