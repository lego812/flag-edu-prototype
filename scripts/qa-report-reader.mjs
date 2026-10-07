import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

// Read-only localhost regression. Uses existing tagged QA fixtures only.
// No route interception, successful business mutation, seeding or cleanup.
const [modulePath] = process.argv.slice(2);
assert.ok(modulePath, "Pass the installed Playwright module path.");
const base = "http://localhost:3000";
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, "vhlrmudatjcgspwltdix.supabase.co");
const fixture = JSON.parse(await readFile("artifacts/aside/iphone18-webkit-20261007/private-fixture.json", "utf8"));
assert.match(fixture.prefix, /^QA-WS-CRUD-\d+$/);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const required = async query => {
  const result = await query;
  if (result.error) throw new Error(result.error.code ?? "QA read failed");
  return result.data;
};
assert.equal((await required(db.from("organizations").select("name").eq("id", fixture.organization.id).single())).name, `${fixture.prefix}-A`);
for (const role of ["admin", "coach"]) {
  assert.equal((await required(db.auth.admin.getUserById(fixture.users[role].id))).user.user_metadata.qa_fixture, true);
  assert.equal((await required(db.from("profiles").select("organization_id").eq("id", fixture.users[role].id).single())).organization_id, fixture.organization.id);
}
const tables = ["courses", "class_sessions", "reports", "template_versions", "report_attachments", "export_jobs"];
const snapshot = () => Promise.all(tables.map(async table => [table, await required(db.from(table).select("*").eq("organization_id", fixture.organization.id).order("id"))]));
const initial = await snapshot();
const reports = [];
for (const id of [...new Set([fixture.created.report, fixture.created.photoReport])].filter(Boolean)) {
  const report = await required(db.from("reports").select("*,class_sessions(title,status),report_answers(field_id,value)").eq("id", id).eq("organization_id", fixture.organization.id).single());
  const template = await required(db.from("template_versions").select("template_fields(*)").eq("id", report.template_version_id).eq("organization_id", fixture.organization.id).single());
  reports.push({ ...report, fields: template.template_fields.sort((a, b) => a.sort_order - b.sort_order) });
}
const { chromium, webkit, devices } = await import(pathToFileURL(modulePath).href);
const engine = process.env.QA_BROWSER ?? "chromium";
assert.ok(["chromium", "webkit"].includes(engine));
const browser = await (engine === "chromium" ? chromium.launch({ channel: "chrome", headless: true }) : webkit.launch({ headless: true }));
const output = path.resolve("artifacts/aside", `report-reader-${engine}-${Date.now()}`);
await mkdir(output, { recursive: true });
const results = [], errors = [], writes = [];
let failure, dataUnchanged = false;
const scrub = value => String(value).replace(/https?:\/\/[^\s]+/g, "[url]").replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, "[qa-id]");
const record = async (name, fn) => {
  await fn();
  results.push({ name, status: "PASS" });
  console.log(JSON.stringify({ name, status: "PASS" }));
};
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
async function capture(page, filename) {
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (["SCRIPT", "STYLE"].includes(node.parentElement?.tagName)) continue;
      node.textContent = node.textContent.replace(/QA-WS-CRUD-\d+/g, "예시 수업").replace(/QA admin/g, "예시 관리자").replace(/QA coach/g, "예시 코치");
    }
  });
  await page.addStyleTag({ content: "nextjs-portal { display:none!important }" });
  await page.screenshot({ path: path.join(output, filename), fullPage: !filename.includes("enlarged"), animations: "disabled" });
}
try {
  for (const profile of ["mobile", "desktop"]) {
    const options = profile === "mobile" ? { ...devices["iPhone 17 Pro"], viewport: { width: 402, height: 874 }, screen: { width: 402, height: 874 }, deviceScaleFactor: 3 } : { viewport: { width: 1280, height: 900 } };
    for (const role of ["admin", "coach"]) {
      const context = await browser.newContext(options);
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on("pageerror", error => errors.push({ profile, role, message: scrub(error.message) }));
      page.on("request", request => {
        const url = new URL(request.url());
        if (url.origin === base && !["GET", "HEAD", "OPTIONS"].includes(request.method()) && url.pathname !== "/login") writes.push({ method: request.method(), path: scrub(url.pathname) });
      });
      try {
        await page.goto(base + "/login");
        await page.locator('[name="email"]').fill(fixture.users[role].email);
        await page.locator('[name="password"]').fill(fixture.users[role].password);
        await page.getByRole("button", { name: "로그인", exact: true }).click();
        await page.waitForURL("**/dashboard");
        await page.waitForLoadState("networkidle");
        for (const [index, report] of reports.entries()) {
          await record(`${profile}/${role}/report-${index}/reading-order-and-values`, async () => {
            await page.goto(`${base}/reports/${report.id}?edit=1`);
            await page.getByRole("heading", { level: 1, name: report.class_sessions.title, exact: true }).waitFor();
            await page.waitForLoadState("networkidle");
            assert.equal(await noOverflow(page), true);
            assert.equal(await page.locator("article").evaluate(node => getComputedStyle(node).backgroundColor), "rgb(255, 255, 255)");
            assert.deepEqual(await page.locator("article dt, article section h2").allTextContents(), report.fields.map(field => field.label));
            for (const field of report.fields.filter(field => field.field_type !== "photo")) {
              const value = report.report_answers.find(answer => answer.field_id === field.id)?.value;
              const row = page.locator("article dl").filter({ has: page.locator("dt").filter({ hasText: field.label }) });
              const empty = value == null || (typeof value === "string" && value.trim() === "") || (Array.isArray(value) && !value.length);
              const expected = empty ? "미입력" : field.field_type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value).replaceAll("-", ".") : Array.isArray(value) ? value.join("") : String(value);
              if (Array.isArray(value) && value.length) assert.deepEqual(await row.locator("li").allTextContents(), value.map(String));
              else assert.equal(await row.locator("dd").textContent(), expected);
              assert.ok(Number.parseFloat(await row.locator("dd").evaluate(node => getComputedStyle(node).fontSize)) >= 16);
            }
            if (report.class_sessions.status === "cancelled") {
              assert.equal(await page.getByRole("link", { name: "수정", exact: true }).count(), 0);
              assert.equal(await page.getByRole("button", { name: /임시저장|제출|삭제/ }).count(), 0);
              assert.equal(await page.locator('input[type="file"], textarea').count(), 0);
              await page.getByText(/취소된 수업입니다/).waitFor();
            }
            assert.equal(await page.getByRole("link", { name: "보고서 목록" }).getAttribute("href"), role === "admin" ? "/admin-reports" : "/reports");
          });
          if (index === 0) await capture(page, `${profile}-${role}-reading.png`);
          const trigger = page.getByRole("button", { name: /크게 보기$/ }).first();
          if (await trigger.count()) await record(`${profile}/${role}/report-${index}/photo-modal`, async () => {
            const originalUrl = page.url();
            await trigger.locator("img").evaluate(img => img.decode());
            await trigger.focus();
            if (profile === "mobile") await trigger.tap(); else await trigger.click();
            const dialog = page.getByRole("dialog");
            await dialog.waitFor();
            await dialog.getByRole("img").evaluate(img => img.decode());
            assert.ok(await dialog.getByRole("img").evaluate(img => img.naturalWidth > 0));
            assert.ok(await dialog.getByRole("img").evaluate(img => img.getBoundingClientRect().width > 100));
            assert.ok(await dialog.evaluate(node => { const box = node.getBoundingClientRect(); return box.x >= 0 && box.y >= 0 && box.right <= innerWidth && box.bottom <= innerHeight; }));
            const close = dialog.getByRole("button", { name: "닫기" });
            assert.ok((await close.boundingBox()).height >= 44);
            await capture(page, `${profile}-${role}-enlarged.png`);
            await close.focus();
            await page.keyboard.press("Tab");
            assert.equal(await dialog.evaluate(node => node.contains(document.activeElement) || document.activeElement === document.body), true);
            await page.keyboard.press("Tab");
            assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true);
            await page.keyboard.press("Escape");
            await page.locator("dialog").waitFor({ state: "detached" });
            assert.equal(await trigger.evaluate(node => document.activeElement === node), true);
            await page.waitForFunction(() => document.body.style.overflow === "");
            assert.equal(await page.evaluate(() => document.body.style.overflow), "");
            await trigger.click();
            await page.getByRole("dialog").waitFor();
            await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
            await page.locator("dialog").waitFor({ state: "detached" });
            await page.waitForFunction(() => document.body.style.overflow === "");
            await trigger.click();
            await page.getByRole("dialog").waitFor();
            if (profile === "mobile") await page.touchscreen.tap(5, 5); else await page.mouse.click(5, 5);
            await page.locator("dialog").waitFor({ state: "detached" });
            assert.equal(await trigger.evaluate(node => document.activeElement === node), true);
            await page.waitForFunction(() => document.body.style.overflow === "");
            assert.equal(page.url(), originalUrl);
            assert.equal(context.pages().length, 1);
            await capture(page, `${profile}-${role}-photos.png`);
          });
        }
        await record(`${profile}/${role}/long-text-layout-dom-only`, async () => {
          // Disposable DOM changes test layout limits; no form or DB mutation.
          await page.evaluate(() => {
            document.querySelector("article h1").textContent = "아주긴수업제목".repeat(25);
            const label = document.querySelector("article dt");
            const answer = document.querySelector("article dd");
            if (label) label.textContent = "LongLabel".repeat(30);
            if (answer) answer.textContent = "긴본문".repeat(500);
          });
          assert.equal(await noOverflow(page), true);
          assert.equal(await page.locator("article h1").evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
          if (await page.locator("article dd").count()) assert.equal(await page.locator("article dd").first().evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
          if (profile === "mobile" && await page.locator("article section ul").count()) {
            await page.locator("article section ul").first().evaluate(list => { for (let index = 0; index < 5; index++) list.append(list.firstElementChild.cloneNode(true)); });
            assert.equal(await noOverflow(page), true);
            assert.equal(await page.locator("article section ul").first().evaluate(node => node.scrollWidth > node.clientWidth), true);
          }
        });
      } catch (error) {
        console.log(JSON.stringify({ profile, role, previewDiagnostics: { dialogs: await page.locator("dialog").count(), openDialogs: await page.locator("dialog[open]").count(), images: await page.locator("dialog img").count(), alerts: await page.locator("dialog [role=alert]").count() } }));
        await capture(page, `${profile}-${role}-failure.png`).catch(() => {});
        throw error;
      } finally { await context.close(); }
    }
  }
  assert.deepEqual(writes, [], "Unexpected business mutation request");
  assert.deepEqual(errors, [], "Browser errors");
} catch (error) {
  failure = { message: scrub(error.message), name: error.name };
  process.exitCode = 1;
  console.log(JSON.stringify({ status: "FAIL", failure }));
} finally {
  await browser.close();
  try { assert.deepEqual(await snapshot(), initial); dataUnchanged = true; }
  catch { failure ??= { message: "Business snapshot changed" }; process.exitCode = 1; }
  await writeFile(path.join(output, "results.json"), JSON.stringify({ sourceCommit: process.env.QA_SOURCE_COMMIT ?? "working-tree", base, engine, realDevice: false, profiles: { mobile: { width: 402, height: 874, dpr: 3, installed: "iPhone 17 Pro" }, desktop: { width: 1280, height: 900 } }, results, failure, errors, writes, dataUnchanged }, null, 2));
  console.log(JSON.stringify({ output: path.basename(output), passed: results.length, browserErrors: errors.length, businessWrites: writes.length, dataUnchanged, status: failure ? "FAIL" : "PASS" }));
}
