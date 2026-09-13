import { createServer } from "node:net";

/** Finds a free TCP port by asking the OS for an ephemeral one and
 * releasing it immediately. There's a small race between releasing and
 * the caller binding it, but it's good enough for test orchestration. */
export async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("could not determine free port")));
      }
    });
  });
}

/** Polls `check` until it resolves true or the timeout elapses. */
export async function waitUntil(
  check: () => Promise<boolean>,
  { timeoutMs = 60_000, intervalMs = 250 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (await check().catch(() => false)) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitUntil: timed out after ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
