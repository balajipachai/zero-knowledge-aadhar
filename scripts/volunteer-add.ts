#!/usr/bin/env tsx
/**
 * Interactively creates (or updates the password of) a volunteer account.
 * Never accepts the password as a CLI argument (it would end up in shell
 * history) -- always prompts, with the terminal echo suppressed.
 *
 * Usage: npm run volunteer:add
 */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Client } from "pg";
import { hashPassword } from "../src/server/auth/password";

const BACKSPACE = "\x7f";
const CTRL_C = "\x03";

/** Reads one line from stdin without echoing typed characters to the
 * terminal (so a password never appears in a scrollback buffer or in
 * shell history). Falls back to plain (visible) input when stdin isn't a
 * TTY, e.g. piped input in CI. */
async function promptHidden(question: string): Promise<string> {
  stdout.write(question);

  if (!stdin.isTTY) {
    const rl = createInterface({ input: stdin, output: stdout });
    const answer = await rl.question("");
    rl.close();
    return answer;
  }

  return new Promise((resolve) => {
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const onData = (char: string) => {
      if (char === "\n" || char === "\r") {
        cleanup();
        stdout.write("\n");
        resolve(value);
        return;
      }
      if (char === CTRL_C) {
        cleanup();
        stdout.write("\n");
        process.exit(130);
      }
      if (char === BACKSPACE) {
        value = value.slice(0, -1);
        return;
      }
      value += char;
    };

    function cleanup() {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
    }

    stdin.on("data", onData);
  });
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const email = (await rl.question("Volunteer email: ")).trim().toLowerCase();
  rl.close();

  if (!email || !email.includes("@")) {
    console.error("Not a valid email");
    process.exit(1);
  }

  const password = await promptHidden("Password (hidden): ");
  const confirm = await promptHidden("Confirm password (hidden): ");

  if (password.length < 12) {
    console.error("Password must be at least 12 characters");
    process.exit(1);
  }
  if (password !== confirm) {
    console.error("Passwords do not match");
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const passwordHash = await hashPassword(password);
    await client.query(
      `INSERT INTO volunteers (email, password_hash) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [email, passwordHash],
    );
    console.log(`Volunteer account ready for ${email}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
