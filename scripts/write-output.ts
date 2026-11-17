/**
 * write-output.ts — write a CLI's output completely before the process exits.
 *
 * The runtime scripts print one JSON result and then call `process.exit()`, which is how
 * their CLIs stop: `if (cmd === "gate") print(…)` relies on `print` never returning. But on
 * a pipe — how Claude Code's Bash tool, the hooks and every consumer read these scripts —
 * Node writes `process.stdout` asynchronously, and `process.exit()` drops whatever is still
 * queued. Past the pipe's buffer (64 KiB on macOS) a result arrives cut off and is no longer
 * JSON. A large `.ono/repo-knowledge.json` read through read-repo-knowledge.ts did exactly
 * that, every time.
 *
 * These functions write straight to the file descriptor with `fs.writeSync`, so the whole
 * text is written before they return and an `exit()` after them loses nothing. Exit codes,
 * control flow, the JSON itself and stdout/stderr separation are exactly as before: only how
 * the bytes are written changes. `process.exitCode` alone would not do — the CLIs would run
 * on past `print` and print again.
 *
 * A pipe can be non-blocking; when it is full, `writeSync` throws EAGAIN and we wait 1 ms
 * for the reader to drain it. If the reader is gone (EPIPE), there is no one left to write
 * to: we stop writing, and the caller's exit code stands.
 *
 * Runtime: Node 22.18+ or 24+ (see scripts/node-preflight.mjs). No dependencies.
 */
import { writeSync } from "fs";

const pause = new Int32Array(new SharedArrayBuffer(4));

/** Writes all of `text` to `fd` before returning. */
export function writeAll(fd: number, text: string): void {
  const bytes = Buffer.from(text, "utf-8");
  let offset = 0;
  while (offset < bytes.length) {
    try {
      offset += writeSync(fd, bytes, offset, bytes.length - offset);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "EAGAIN") {
        Atomics.wait(pause, 0, 0, 1);
        continue;
      }
      if (code === "EPIPE") return;
      throw e;
    }
  }
}

/** `process.stdout.write(text)`, written completely before it returns. */
export const writeStdout = (text: string): void => writeAll(1, text);

/** `process.stderr.write(text)`, written completely before it returns. */
export const writeStderr = (text: string): void => writeAll(2, text);
