import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

// Local production comparison only. Timestamped raw diagnostics stay ignored.
// Never filters errors or accesses database credentials.
assert.equal(process.argv[2] ?? "3001", "3001");
const output = path.resolve("artifacts/aside", `local-server-${Date.now()}`);
await mkdir(output, { recursive: true });
const log = createWriteStream(path.join(output, "server.jsonl"));
const require = createRequire(import.meta.url);
const child = spawn(process.execPath, ["--import", new URL("./qa-server-request-trace.mjs", import.meta.url).href, require.resolve("next/dist/bin/next"), "start", "--port", "3001"], { stdio: ["ignore", "pipe", "pipe"] });
for (const stream of ["stdout", "stderr"]) {
  child[stream].on("data", bytes => {
    const text = String(bytes);
    log.write(JSON.stringify({ time: Date.now(), stream, text }) + "\n");
    process[stream].write(text);
  });
}
console.log(`QA server diagnostics: ${path.basename(output)}`);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill());
child.on("error", error => { console.error(error.message); process.exitCode = 1; log.end(); });
child.on("exit", code => { log.end(); process.exitCode = code ?? 0; });
