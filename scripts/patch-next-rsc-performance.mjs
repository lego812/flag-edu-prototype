import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Temporary source fix for React #37561. Matches the existing rendered-track
// guard and upstream proposal #37572; NOT a global Performance API shim or
// error filter. Remove/review when upgrading Next's bundled Flight client.
export const NEXT_VERSION = "16.3.8";
const hashes = {
  "turbopack.browser": "14b283240e81eaa7150d68debc801d3c069e53a57178ec6972a45ce1c59db793",
  "turbopack.edge": "e9886c3cacd3d676165b68793e76773a11019b0707a67be3721a5edcafbd6001",
  "turbopack.node": "e8ebf59c37b2a6755d70e86eb96e199da6a710c654f8765232413e1c07c66a87",
  "webpack.browser": "7bd7256ab729c755623f27f71bcb656ed3b26d022cef28f15ab3cfbd29048d37",
  "webpack.edge": "2c3246376222858655c7095ef576ff404df87e2da36bd4a4992472c3f9288852",
  "webpack.node": "45de09f2bde1c3c4424c0a54301e138d1a5e9fed3a798704aaf71b7916dd16b0",
};
export const targets = Object.entries(hashes).map(([key, sha256]) => {
  const [bundler, runtime] = key.split(".");
  return { file: `dist/compiled/react-server-dom-${bundler}/cjs/react-server-dom-${bundler}-client.${runtime}.development.js`, sha256 };
});
export const guards = [
  { before: "error = root.reason;\n                    if (supportsUserTiming)", after: "error = root.reason;\n                    if (supportsUserTiming && 0 <= childrenEndTime$jscomp$1 && 10 > trackIdx$jscomp$1)" },
  { before: "childrenEndTime$jscomp$3 = childrenEndTime;\n                  if (supportsUserTiming)", after: "childrenEndTime$jscomp$3 = childrenEndTime;\n                  if (supportsUserTiming && 0 <= childrenEndTime$jscomp$3 && 10 > trackIdx$jscomp$4)" },
];

export function patchSource(source, target, version) {
  assert.equal(version, NEXT_VERSION, "Review the RSC performance patch before changing Next versions.");
  // Already-patched installs are accepted only if undoing our TWO exact hunks
  // restores the known original bytes. Any upstream/local change fails closed.
  let original = source;
  for (const { before, after } of guards) {
    assert.ok(original.includes(before) !== original.includes(after), `Unexpected performance guard: ${target.file}`);
    if (original.includes(after)) original = original.replace(after, before);
    assert.equal(original.split(before).length, 2, "Ambiguous performance patch location.");
  }
  assert.equal(createHash("sha256").update(original).digest("hex"), target.sha256, `Unexpected Next source bytes: ${target.file}`);
  return guards.reduce((result, { before, after }) => result.replace(before, after), original);
}

export async function patchInstalledNext() {
  const require = createRequire(import.meta.url);
  const packagePath = require.resolve("next/package.json");
  const { version } = JSON.parse(await readFile(packagePath, "utf8"));
  const root = path.dirname(packagePath);
  // Validate every target before changing any file. Production bundles and
  // source maps are untouched; no new runtime dependencies are required.
  const plans = await Promise.all(targets.map(async target => {
    const file = path.join(root, target.file);
    const source = await readFile(file, "utf8");
    return { file, source, patched: patchSource(source, target, version) };
  }));
  for (const plan of plans) if (plan.source !== plan.patched) await writeFile(plan.file, plan.patched);
  console.log(`Next ${version}: verified RSC development performance guards in ${plans.length} clients.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await patchInstalledNext();
