import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { findNativeCancellation } from "./qa-browser-observations.mjs";

// Native Link/touch comparison, not repeated document goto or intercepted fetch.
const [base, modulePath] = process.argv.slice(2);
assert.ok(["http://localhost:3000", "http://localhost:3001", "https://flag-edu-prototype.vercel.app"].includes(base));
const fixture = JSON.parse(await readFile("artifacts/aside/iphone18-webkit-20261007/private-fixture.json", "utf8"));
assert.match(fixture.prefix, /^QA-WS-CRUD-\d+$/);
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, "vhlrmudatjcgspwltdix.supabase.co");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const required = async query => { const { data, error } = await query; assert.ok(!error, error?.code); return data; };
assert.equal((await required(db.from("organizations").select("name").eq("id", fixture.organization.id).single())).name, `${fixture.prefix}-A`);
for (const role of ["admin", "coach"]) {
  assert.equal((await required(db.auth.admin.getUserById(fixture.users[role].id))).user.user_metadata.qa_fixture, true);
  assert.equal((await required(db.from("profiles").select("organization_id").eq("id", fixture.users[role].id).single())).organization_id, fixture.organization.id);
}
const snapshot = () => Promise.all(["courses", "class_sessions", "reports", "template_versions", "report_attachments", "export_jobs"].map(async table => [table, await required(db.from(table).select("*").eq("organization_id", fixture.organization.id).order("id"))]));
const initial = await snapshot();
const { chromium, webkit, devices } = await import(pathToFileURL(modulePath).href);
const engine = process.env.QA_BROWSER ?? "chromium";
assert.ok(["chromium", "webkit"].includes(engine));
const browser = await (engine === "webkit" ? webkit.launch({ headless: true }) : chromium.launch({ channel: "chrome", headless: true }));
const output = path.resolve("artifacts/aside", `native-menu-${engine}-${Date.now()}`);
await mkdir(output, { recursive: true });
const startedAt = new Date().toISOString();
const results = [], errors = [], exceptions = [], failedRequests = [], warnings = [], writes = [];
const scrub = value => String(value).replace(/https?:\/\/\S+/g, "[url]").replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, ":id");
let failure, dataUnchanged = false;
try {
  for (const role of ["admin", "coach"]) {
    const context = await browser.newContext({ ...devices["iPhone 17 Pro"], viewport: { width: 402, height: 874 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.addEventListener("error", event => console.info("QA_EXCEPTION:" + event.message));
      window.addEventListener("unhandledrejection", event => console.info("QA_EXCEPTION:" + String(event.reason?.message ?? event.reason)));
    });
    page.on("console", message => { if (message.text().startsWith("QA_EXCEPTION:")) exceptions.push(scrub(message.text())); });
    page.on("pageerror", error => errors.push({ role, time: Date.now(), rawMessage: error.message, message: scrub(error.message) }));
    page.on("requestfailed", request => failedRequests.push({ role, time: Date.now(), url: request.url(), reason: request.failure()?.errorText }));
    page.on("request", request => { if (new URL(request.url()).origin === base && !["GET", "HEAD", "OPTIONS"].includes(request.method()) && new URL(request.url()).pathname !== "/login") writes.push(scrub(new URL(request.url()).pathname)); });
    const settled = async route => {
      await page.waitForURL(url => url.pathname === route);
      await page.getByRole("heading", { level: 1 }).waitFor();
      await page.waitForLoadState("networkidle");
      assert.equal(await page.getByLabel("워크스페이스", { exact: true }).inputValue(), fixture.organization.id);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    };
    const tap = async (link, route) => {
      await link.tap();
      await settled(route);
      results.push({ role, route: scrub(route), status: "PASS" });
    };
    try {
      await page.goto(base + "/login");
      await page.locator('[name="email"]').fill(fixture.users[role].email);
      await page.locator('[name="password"]').fill(fixture.users[role].password);
      await page.getByRole("button", { name: "로그인", exact: true }).tap();
      await settled("/dashboard");
      // Only the initial login is a document navigation. All checks below use
      // visible application links and preserve the real Next Router behavior.
      for (let round = 0; round < 2; round++) for (const route of ["/courses", "/classes", "/reports", "/dashboard"]) await tap(page.getByRole("navigation", { name: "주 메뉴" }).locator(`a[href="${route}"]`), route);
      if (role === "admin") for (const route of ["/admin-reports", "/templates", "/members", "/exports", "/workspaces"]) {
        await tap(page.getByRole("navigation", { name: "주 메뉴" }).locator('a[href="/manage"]'), "/manage");
        await tap(page.locator(`main a[href="${route}"]`), route);
      }
      else assert.equal(await page.getByRole("navigation").locator('a[href="/manage"]').count(), 0);
      if (role === "admin") {
        await tap(page.getByRole("navigation", { name: "주 메뉴" }).locator('a[href="/manage"]'), "/manage");
        await tap(page.locator('main a[href="/admin-reports"]'), "/admin-reports");
      } else await tap(page.getByRole("navigation", { name: "주 메뉴" }).locator('a[href="/reports"]'), "/reports");
      const route = `/reports/${fixture.created.photoReport}`;
      await tap(page.locator(`main a[href="${route}"]`), route);
      const trigger = page.getByRole("button", { name: /크게 보기$/ }).first();
      await trigger.tap();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await dialog.locator("img").evaluate(img => img.decode());
      assert.ok(await dialog.locator("img").evaluate(img => img.naturalWidth > 0));
      await dialog.getByRole("button", { name: "닫기", exact: true }).tap();
      await page.locator("dialog").waitFor({ state: "detached" });
      assert.equal(await trigger.evaluate(button => button === document.activeElement), true);
      results.push({ role, route: "photo-preview", status: "PASS" });
      await page.waitForLoadState("networkidle");
    } finally { await context.close(); }
  }
  assert.deepEqual(exceptions, []);
  assert.deepEqual(writes, []);
  for (const error of errors) {
    const match = findNativeCancellation(error, failedRequests);
    if (match) warnings.push({ role: error.role, time: error.time, message: error.message, reason: match.reason });
    else throw new Error(error.message);
  }
} catch (error) { failure = scrub(error.message); process.exitCode = 1; }
finally {
  await browser.close();
  try { assert.deepEqual(await snapshot(), initial); dataUnchanged = true; } catch { failure ??= "Business data changed"; process.exitCode = 1; }
  await writeFile(path.join(output, "results.json"), JSON.stringify({ base, engine, sourceCommit: process.env.QA_SOURCE_COMMIT ?? "unspecified", startedAt, finishedAt: new Date().toISOString(), results, failure, exceptions, errors: errors.map(error => ({ role: error.role, time: error.time, message: error.message })), failedRequests: failedRequests.map(({ url, ...request }) => ({ ...request, resource: scrub(new URL(url).pathname) })), warnings, writes, dataUnchanged }, null, 2));
  console.log(JSON.stringify({ run: path.basename(output), status: failure ? "FAIL" : "PASS", checks: results.length, domExceptions: exceptions.length, warnings: warnings.length, businessWrites: writes.length, dataUnchanged, failure }));
}
