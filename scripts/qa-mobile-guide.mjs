import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { findNativeCancellation, isCurrentDocument, isLocalDevelopmentDiagnostic } from "./qa-browser-observations.mjs";
import { observeReadOnlyNetwork } from "./qa-network-idle.mjs";

// Read-only integration and curated README captures. Never submits business
// forms, changes permissions, sends mail, or generates exports.
const [base, modulePath] = process.argv.slice(2);
assert.ok(["http://localhost:3000", "http://localhost:3001", "https://flag-edu-prototype.vercel.app"].includes(base));
assert.ok(modulePath, "Pass the installed Playwright module path.");
const sourceRun = process.env.QA_FIXTURE_RUN ?? "iphone18-webkit-20261007";
assert.match(sourceRun, /^[a-z0-9-]+$/);
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, "vhlrmudatjcgspwltdix.supabase.co");
const fixture = JSON.parse(await readFile(path.resolve("artifacts/aside", sourceRun, "private-fixture.json"), "utf8"));
assert.match(fixture.prefix, /^QA-WS-CRUD-\d+$/);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const required = async query => { const result = await query; if (result.error) throw new Error(result.error.code ?? "QA query failed"); return result.data; };
const organization = await required(db.from("organizations").select("name").eq("id", fixture.organization.id).single());
assert.equal(organization.name, `${fixture.prefix}-A`, "Only the approved QA workspace can be used.");
for (const role of ["admin", "coach"]) {
  assert.equal((await required(db.auth.admin.getUserById(fixture.users[role].id))).user.user_metadata.qa_fixture, true);
  const profile = await required(db.from("profiles").select("organization_id").eq("id", fixture.users[role].id).single());
  assert.equal(profile.organization_id, fixture.organization.id, "Restore the approved QA workspace before running this read-only suite.");
}
const tables = ["courses", "class_sessions", "reports", "template_versions", "report_attachments", "export_jobs"];
async function snapshot() {
  return Promise.all(tables.map(async table => [table, await required(db.from(table).select("*").eq("organization_id", fixture.organization.id).order("id"))]));
}
const initial = await snapshot();
const { webkit, chromium, devices } = await import(pathToFileURL(modulePath).href);
const engine = process.env.QA_BROWSER ?? "webkit";
assert.ok(["webkit", "chromium"].includes(engine));
// 18 Pro size approximation: 1206x2622 / assumed DPR 3. App-content-only
// viewport, not an iOS 27 or physical Safari certification.
const options = { ...devices["iPhone 17 Pro"], viewport: { width: 402, height: 874 }, screen: { width: 402, height: 874 }, deviceScaleFactor: 3 };
const browser = await (engine === "webkit" ? webkit.launch({ headless: true }) : chromium.launch({ headless: true, channel: "chrome" }));
const output = path.resolve("artifacts/aside", `mobile-guide-${base.includes("localhost") ? "development" : "production"}-${Date.now()}`);
await mkdir(output, { recursive: true });
const captureDocs = process.env.QA_CAPTURE_DOCS === "1";
assert.ok(!captureDocs || base !== "http://localhost:3001", "Local production-build comparisons do not replace published guide images.");
assert.ok(!captureDocs || engine === "webkit", "Published guide images use the recorded WebKit capture profile.");
if (captureDocs) assert.match(process.env.QA_SOURCE_COMMIT ?? "", /^[a-f0-9]{40}$/, "Record the verified app commit when publishing screenshots.");
const images = [];
const results = [];
const errors = [];
const browserExceptions = [];
const failedRequests = [];
const cancelledRequestWarnings = [];
const workspaceApiResponses = [];
const businessWrites = [];
const developmentDiagnostics = [];
const startedAt = new Date().toISOString();
const scrub = value => value.replace(/https?:\/\/[^\s]+/g, "[url]").replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, "[qa-id]");
const publicError = ({ role, phase, message, stack, time }) => ({ role, phase, message, stack, time });
const publicFailedRequest = ({ role, phase, resource, reason, time }) => ({ role, phase, resource, reason, time });
let failure;
let dataUnchanged = false;
let phase = "setup";
const settledNetworks = new WeakMap();

async function record(name, run) {
  phase = name;
  await run();
  results.push({ name, status: "PASS" });
  console.log(JSON.stringify({ environment: base.includes("localhost") ? "development" : "production", name: scrub(name), status: "PASS" }));
}
async function visit(page, route) {
  // Login has already navigated to /dashboard. Do not immediately reload
  // that document and abort its newly scheduled Link prefetches. This is a
  // screen assertion, not a reload-stress test. Prefer real application links
  // for other routes, preserving Next Router and its in-flight prefetches.
  // Direct-address access remains the fallback for otherwise unreachable
  // routes; denied administrator paths are tested separately below.
  if (!isCurrentDocument(page.url(), base + route)) {
    const link = page.locator(`a[href="${route}"]`).filter({ visible: true }).first();
    if (await link.count()) {
      await link.tap();
      await page.waitForURL(url => isCurrentDocument(url.href, base + route));
    } else {
      const response = await page.goto(base + route, { waitUntil: "domcontentloaded" });
      assert.ok(response.status() < 400, "Authorized page HTTP failure");
    }
  }
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.waitForLoadState("networkidle");
  await settledNetworks.get(page)?.();
  assert.equal(new URL(page.url()).pathname, route.split("?")[0]);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, "Horizontal overflow");
}
async function capture(page, file, role, scrollTo) {
  if (!captureDocs) return;
  // Alter only example identities in this disposable browser's DOM. No DB
  // changes, real users, browser chrome, tokens or signed URLs enter the image.
  await page.evaluate(users => {
    const replacements = Object.entries(users).flatMap(([role, user]) => [[user.email, `${role}@example.com`], [`QA ${role}`, role === "admin" ? "예시 관리자" : "예시 코치"]]);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (["SCRIPT", "STYLE"].includes(node.parentElement?.tagName)) continue;
      let text = node.textContent;
      for (const [before, after] of replacements) text = text.split(before).join(after);
      node.textContent = text.replace(/QA-WS-CRUD-\d+/g, "QA 교육");
    }
  }, Object.fromEntries(Object.entries(fixture.users).map(([role, user]) => [role, { email: user.email }])));
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  if (scrollTo) await scrollTo.evaluate(element => element.scrollIntoView({ block: "start" }));
  else await page.evaluate(() => scrollTo(0, 0));
  for (const img of await page.locator("img").all()) await img.evaluate(node => node.decode()).catch(() => {});
  const body = await page.locator("body").innerText();
  assert.ok(!/QA-WS-CRUD-\d+|https?:\/\/.*(?:token|storage\/v1)|[0-9a-f]{8}-[0-9a-f-]{27,}/i.test(body), "Unmasked identifier");
  for (const user of Object.values(fixture.users)) {
    assert.ok(!body.includes(user.email));
    assert.ok(!body.includes(user.password));
  }
  await mkdir(path.resolve("docs/images"), { recursive: true });
  const bytes = await page.screenshot({ path: path.resolve("docs/images", file), type: "jpeg", quality: 86, fullPage: false, animations: "disabled", scale: "device" });
  images.push({ file, role, route: new URL(page.url()).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, ":id"), sha256: createHash("sha256").update(bytes).digest("hex") });
  // Scrolling/redaction can reveal Link prefetch targets after the initial
  // idle wait. Finish those requests before the next document navigation.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForLoadState("networkidle");
  await settledNetworks.get(page)?.();
}

try {
  const anonymous = await browser.newContext(options);
  const page = await anonymous.newPage();
  await record("anonymous/login-guidance", async () => {
    await page.goto(base + "/");
    assert.equal(new URL(page.url()).pathname, "/login");
    const guidance = page.getByText("회원가입은 관리자 계정의 이메일 초대로만 가능합니다.", { exact: true });
    await guidance.waitFor();
    const forgot = await page.getByRole("link", { name: "비밀번호를 잊으셨나요?", exact: true }).boundingBox();
    assert.ok((await guidance.boundingBox()).y > forgot.y + forgot.height);
    assert.equal(await page.getByText("이미 비밀번호를 설정한 계정으로 로그인하세요.", { exact: true }).count(), 0);
    await capture(page, "common-login.jpg", "common");
  });
  await record("anonymous/protected-workspace-api", async () => {
    const response = await fetch(base + "/api/workspaces/current", { redirect: "manual" });
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get("location"), base).pathname, "/login");
  });
  await anonymous.close();

  for (const role of ["admin", "coach"]) {
    const context = await browser.newContext(options);
    const settleNetwork = observeReadOnlyNetwork(context, base);
    const page = await context.newPage();
    settledNetworks.set(page, settleNetwork);
    // WebKit reports some native load-cancellation messages as pageerror too.
    // Observe DOM exception events and failed requests independently; never
    // blanket-ignore access-control messages or intercept application fetches.
    await page.addInitScript(() => {
      const report = (kind, message) => console.info("QA_BROWSER_EXCEPTION:" + JSON.stringify({ kind, message }));
      window.addEventListener("error", event => report("error", event.message));
      window.addEventListener("unhandledrejection", event => report("unhandledrejection", String(event.reason?.message ?? event.reason)));
    });
    page.on("console", message => {
      if (message.text().startsWith("QA_BROWSER_EXCEPTION:")) {
        const event = JSON.parse(message.text().slice("QA_BROWSER_EXCEPTION:".length));
        browserExceptions.push({ role, phase, kind: event.kind, message: scrub(event.message) });
      }
    });
    page.on("pageerror", error => errors.push({ role, phase, rawMessage: error.message, message: scrub(error.message), stack: scrub(error.stack ?? ""), time: Date.now() }));
    page.on("requestfailed", request => failedRequests.push({ role, phase, url: request.url(), resource: scrub(request.url().replace(/^https?:\/\//, "")), reason: request.failure()?.errorText, time: Date.now() }));
    page.on("response", response => {
      if (new URL(response.url()).pathname === "/api/workspaces/current") workspaceApiResponses.push({ role, phase, status: response.status() });
    });
    page.on("request", request => {
      const url = new URL(request.url());
      if (isLocalDevelopmentDiagnostic(base, request.method(), request.url())) {
        developmentDiagnostics.push({ role, phase, method: request.method(), path: url.pathname, time: Date.now() });
        return; // Exceptions remain strict failures in TWO independent gates.
      }
      if (url.origin === base && !["GET", "HEAD", "OPTIONS"].includes(request.method()) && url.pathname !== "/login") businessWrites.push({ role, method: request.method(), path: scrub(url.pathname) });
    });
    try {
      await visit(page, "/login");
      await page.locator('[name="email"]').fill(fixture.users[role].email);
      await page.locator('[name="password"]').fill(fixture.users[role].password);
      await page.getByRole("button", { name: "로그인", exact: true }).click();
      await page.waitForURL("**/dashboard");
      await page.waitForLoadState("networkidle");
      await settleNetwork();
      assert.equal(await page.getByLabel("워크스페이스", { exact: true }).inputValue(), fixture.organization.id);
      const routes = ["/dashboard", "/courses", `/courses/${fixture.created.course}`, "/courses/new", `/courses/${fixture.created.course}/edit`, "/classes?view=list", "/classes?view=calendar&month=2026-10&date=2026-10-10", `/classes/new?course=${fixture.created.course}`, `/classes/${fixture.created.session}`, "/reports", `/reports/${fixture.created.report}`];
      if (role === "admin") routes.push("/manage", "/admin-reports", "/templates", "/templates/new", "/members", "/exports", "/workspaces");
      for (const route of routes) {
        await record(`${role}:${route}`, () => visit(page, route));
        const files = role === "admin" ? { "/manage": "admin-manage.jpg", "/admin-reports": "admin-reports.jpg", "/templates": "admin-templates.jpg", "/members": "admin-members.jpg", "/exports": "admin-exports.jpg", "/workspaces": "common-workspaces.jpg" } : { "/dashboard": "common-dashboard.jpg", "/courses": "common-courses.jpg", "/courses/new": "common-course-registration.jpg", "/classes?view=list": "common-schedule-list.jpg", "/classes?view=calendar&month=2026-10&date=2026-10-10": "common-calendar.jpg", "/reports": "coach-report-list.jpg", [`/reports/${fixture.created.report}`]: "coach-report-view.jpg" };
        if (files[route]) await capture(page, files[route], role, route.includes("view=calendar") ? page.getByRole("heading", { level: 1 }) : undefined);
      }
      await record(`${role}:schedule-filter-reset-and-view-persistence`, async () => {
        await visit(page, "/classes?view=list&status=completed&sort=oldest&from=2026-10-01&to=2026-10-31");
        await page.getByRole("button", { name: "필터", exact: true }).click();
        await page.locator('button[aria-expanded="true"]').filter({ hasText: "필터" }).waitFor();
        if (role === "coach") await capture(page, "common-schedule-filters.jpg", role, page.getByRole("heading", { level: 1 }));
        await page.getByRole("link", { name: "필터 초기화", exact: true }).click();
        await page.waitForURL("**/classes?view=list&sort=newest");
        // A cached RSC navigation can be committed after networkidle; wait for
        // the expected rendered values rather than reading the old form.
        await page.waitForFunction(() => document.querySelector('[name="from"]')?.value === "" && document.querySelector('[name="to"]')?.value === "" && document.querySelector('[name="status"]')?.value === "all" && document.querySelector('[name="sort"]')?.value === "newest");
        await page.waitForLoadState("networkidle");
        if (await page.getByRole("button", { name: "필터", exact: true }).getAttribute("aria-expanded") !== "true") await page.getByRole("button", { name: "필터", exact: true }).click();
        assert.equal(await page.locator('[name="from"]').inputValue(), "");
        assert.equal(await page.locator('[name="to"]').inputValue(), "");
        assert.equal(await page.locator('[name="status"]').inputValue(), "all");
        assert.equal(await page.locator('[name="sort"]').inputValue(), "newest");
        await page.getByRole("link", { name: "캘린더", exact: true }).tap();
        await page.locator('a[aria-current="date"]').waitFor();
        await visit(page, "/classes?view=calendar&month=2026-10&date=2026-10-10");
        await page.getByRole("link", { name: /^10월 11일,/ }).tap();
        await page.getByRole("heading", { name: "10월 11일 수업", exact: true }).waitFor();
        await visit(page, "/dashboard");
        await visit(page, "/classes");
        await page.locator('a[aria-current="date"]').waitFor();
      });
      await record(`${role}:unsaved-weekly-schedule-preview`, async () => {
        await visit(page, `/classes/new?course=${fixture.created.course}`);
        await page.getByRole("button", { name: "다음 →" }).click();
        await page.getByLabel("반복").selectOption("week");
        for (const day of ["월", "수"]) {
          const checkbox = page.getByLabel(day, { exact: true });
          await checkbox.locator("xpath=..").tap();
          assert.equal(await checkbox.isChecked(), true);
        }
        if (role === "coach") await capture(page, "common-class-registration.jpg", role, page.getByRole("heading", { name: "얼마나 자주 진행하나요?", exact: true }));
        await page.getByRole("button", { name: "다음 →" }).click();
        await page.getByRole("heading", { name: "등록 내용을 확인해 주세요.", exact: true }).waitFor();
        assert.ok(await page.getByRole("button", { name: /개 수업 등록/ }).count());
      });
      if (role === "coach") {
        for (const route of ["/manage", "/admin-reports", "/members", "/templates", "/exports", "/workspaces"]) await record(`coach:denied:${route}`, async () => {
          await page.goto(base + route);
          await page.waitForURL(route === "/admin-reports" ? "**/reports" : "**/dashboard");
          await page.getByRole("heading", { level: 1 }).waitFor();
          await page.waitForLoadState("networkidle");
          assert.equal(await page.getByRole("navigation").locator('a[href="/manage"]').count(), 0);
        });
        const photoReport = fixture.created.photoReport ?? fixture.created.report;
        await record("coach:stored-photo-decodes", async () => {
          await visit(page, `/reports/${photoReport}`);
          const img = page.locator("img").first();
          await img.waitFor();
          await img.evaluate(node => node.decode());
          assert.ok(await img.evaluate(node => node.naturalWidth > 0));
          await capture(page, "coach-report-photos.jpg", role, page.getByRole("heading", { name: /활동 사진/ }));
        });
      } else await record("admin:unsaved-template-choice-editor", async () => {
        await visit(page, "/templates/new");
        await page.getByLabel("양식 이름").fill("수업 활동 보고서");
        await page.getByRole("button", { name: "항목 추가", exact: true }).click();
        const section = page.locator("form section").last();
        await section.getByLabel("항목명", { exact: true }).fill("오늘 활동한 영역");
        await section.getByLabel("입력 유형").selectOption("multi_select");
        for (const label of ["협동", "체력", "창의 활동"]) {
          await section.getByRole("button", { name: "+ 선택지 추가", exact: true }).click();
          await section.locator('input[aria-label*="선택지"]').last().fill(label);
        }
        assert.equal(await section.locator('input[aria-label*="선택지"]').count(), 3);
        await capture(page, "admin-template-editor.jpg", role, section);
      });
      await page.waitForLoadState("networkidle");
    } catch (error) {
      await page.screenshot({ path: path.join(output, `failure-${role}.png`), fullPage: true }).catch(() => {});
      throw error;
    } finally {
      phase = `${role}:context-close`;
      await context.close();
    }
  }
  assert.deepEqual(businessWrites, [], "Unexpected business write request");
  assert.deepEqual(await snapshot(), initial, "Read-only QA altered business data");
  dataUnchanged = true;
  for (const role of ["admin", "coach"]) assert.ok(workspaceApiResponses.some(response => response.role === role && response.status === 200), "No successful authenticated workspace check");
  assert.deepEqual(browserExceptions, [], "DOM exception or unhandled rejection");
  for (let index = errors.length - 1; index >= 0; index--) {
    const error = errors[index];
    const cancellation = findNativeCancellation(error, failedRequests);
    // The WebKit protocol includes fetch initiator stacks for native console
    // errors, not just thrown exceptions. DOM exception events remain a strict
    // gate, and only a same-URL, same-role, contemporaneous native cancellation
    // can be classified as a retained warning here.
    if (error.message.endsWith(" due to access control checks.") && cancellation) {
      cancelledRequestWarnings.push({ ...publicError(error), requestPhase: cancellation.phase, reason: cancellation.reason });
      errors.splice(index, 1);
    }
  }
  assert.deepEqual(errors, [], "Unclassified browser errors");
} catch (error) {
  failure = { name: error.name, message: scrub(error.message) };
  console.log(JSON.stringify({ status: "FAIL", failure }));
  process.exitCode = 1;
} finally {
  await browser.close();
  // Verify business state independently even if an earlier navigation or
  // browser-error gate failed; false must not mean merely "not reached".
  if (!dataUnchanged) {
    try {
      assert.deepEqual(await snapshot(), initial, "Read-only QA altered business data");
      dataUnchanged = true;
    } catch (error) {
      failure ??= { name: error.name, message: scrub(error.message) };
      process.exitCode = 1;
    }
  }
  await writeFile(path.join(output, "results.json"), JSON.stringify({ base, startedAt, finishedAt: new Date().toISOString(), sourceCommit: process.env.QA_SOURCE_COMMIT ?? "unspecified", engine, viewport: options.viewport, screen: options.screen, deviceScaleFactor: 3, realDevice: false, results, failure, businessWrites, developmentDiagnostics, errors: errors.map(publicError), browserExceptions, cancelledRequestWarnings, failedRequests: failedRequests.map(publicFailedRequest), workspaceApiResponses, dataUnchanged, images }, null, 2));
  // A complete, privacy-checked image set can document observed UI even when
  // the stricter browser gate fails. Record that outcome; never turn FAIL into
  // PASS or overwrite its ignored raw results just to publish a screenshot.
  if (captureDocs && images.length === 18 && dataUnchanged && businessWrites.length === 0) await writeFile(path.resolve("docs/images/guide-manifest.json"), JSON.stringify({ sourceCommit: process.env.QA_SOURCE_COMMIT ?? "unspecified", capturedAt: new Date().toISOString(), base, engine: "webkit", installedProfile: "iPhone 17 Pro", intendedSize: "iPhone 18 Pro size approximation", viewport: options.viewport, screen: options.screen, deviceScaleFactor: 3, physicalPixels: { width: 1206, height: 2622 }, realDevice: false, captureValidation: { checksPassed: results.length, browserGatePassed: !failure, unclassifiedBrowserErrors: errors.length, domExceptions: browserExceptions.length, businessDataUnchanged: dataUnchanged }, privacy: "Only tagged QA accounts; example identities anonymized in a disposable DOM; no browser chrome, credentials, signed URLs or raw QA logs.", images }, null, 2) + "\n");
}
