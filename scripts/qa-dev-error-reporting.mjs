import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Explicit isolated development diagnostic. Intentionally throws ONE browser
// error on anonymous login to prove error reporting was not disabled. Run
// separately from integration suites; never against production or real data.
const [base, modulePath] = process.argv.slice(2);
assert.equal(base, "http://localhost:3000");
assert.ok(modulePath);
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 402, height: 874 } });
const message = "QA controlled runtime error reporting probe";
const observed = [];
page.on("pageerror", error => observed.push(error.message));
const output = path.resolve("artifacts/aside", `dev-error-reporting-${Date.now()}`);
await mkdir(output, { recursive: true });
let passed = false;
try {
  await page.goto(base + "/login");
  await page.getByRole("heading", { name: "로그인", exact: true }).waitFor();
  await page.waitForLoadState("networkidle");
  assert.equal(await page.getByRole("button", { name: /Open Next.js Dev Tools/ }).count(), 0);
  const error = page.waitForEvent("pageerror", { timeout: 10000 });
  await page.evaluate(message => setTimeout(() => { throw new Error(message); }, 0), message);
  assert.equal((await error).message, message);
  await page.getByRole("button", { name: "Open issues overlay", exact: true }).click();
  await page.getByText(message, { exact: true }).first().waitFor({ state: "visible", timeout: 10000 });
  assert.deepEqual(observed, [message]);
  passed = true;
} finally {
  await browser.close();
  await writeFile(path.join(output, "results.json"), JSON.stringify({ passed, intentionalErrorCount: observed.length, errorOverlayVisible: passed, devBadgeAbsent: passed, businessFormsSubmitted: false }));
  console.log(JSON.stringify({ run: path.basename(output), status: passed ? "PASS" : "FAIL", intentionalErrorCount: observed.length, errorOverlayVisible: passed }));
}
