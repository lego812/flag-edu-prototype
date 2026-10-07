import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// Uses existing, explicitly tagged QA accounts. Changes only their selected
// workspace, restores it, and never creates/saves/deletes business data or mail.
const [role, engine, modulePath] = process.argv.slice(2);
assert.ok(["coach", "admin"].includes(role));
assert.ok(["chromium", "webkit"].includes(engine));
assert.ok(modulePath, "Pass the installed Playwright module path.");
const base = process.env.QA_BASE_URL ?? "http://localhost:3000";
assert.ok(["http://localhost:3000", "https://flag-edu-prototype.vercel.app"].includes(base));
const sourceRun = process.env.QA_FIXTURE_RUN ?? "iphone18-webkit-20261007";
assert.match(sourceRun, /^[a-z0-9-]+$/);
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, "vhlrmudatjcgspwltdix.supabase.co");
const fixture = JSON.parse(await readFile(path.resolve("artifacts/aside", sourceRun, "private-fixture.json"), "utf8"));
assert.match(fixture.prefix, /^QA-WS-CRUD-\d+$/);
const user = fixture.users[role];
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const required = async query => { const result = await query; if (result.error) throw new Error(result.error.code ?? "QA query failed"); return result.data; };
assert.equal((await required(db.auth.admin.getUserById(user.id))).user.user_metadata.qa_fixture, true);
await required(client.auth.signInWithPassword({ email: user.email, password: user.password }));
const workspaceA = fixture.organization.id;
const workspaceB = fixture.created.workspaceB;
const membership = await required(db.from("workspace_memberships").select("organization_id,role,status").eq("user_id", user.id).in("organization_id", [workspaceA, workspaceB]));
assert.equal(membership.length, 2);
assert.ok(membership.every(row => row.status === "active"));
const original = await required(db.from("profiles").select("organization_id").eq("id", user.id).single());
const initialCourse = await required(db.from("courses").select("title,updated_at").eq("id", fixture.created.course).eq("organization_id", workspaceA).single());
const initialReport = await required(db.from("reports").select("updated_at,status").eq("id", fixture.created.report).eq("organization_id", workspaceA).single());
const { chromium, webkit, devices } = await import(pathToFileURL(modulePath).href);
const browser = engine === "webkit" ? await webkit.launch({ headless: true }) : await chromium.launch({ channel: "chrome", headless: true });
const output = path.resolve("artifacts/aside", `workspace-sync-${engine}-${role}-${Date.now()}`);
await mkdir(output, { recursive: true });
const results = [];
const errors = [];
let failure;

async function visit(page, route) {
  const response = await page.goto(`${base}${route}`);
  assert.ok(response.status() < 400);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.waitForLoadState("networkidle");
}
async function login(page) {
  await visit(page, "/login");
  await page.locator('[name="email"]').fill(user.email);
  await page.locator('[name="password"]').fill(user.password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await page.waitForLoadState("networkidle");
}
async function switchTo(page, id) {
  await page.getByLabel("워크스페이스", { exact: true }).selectOption(id);
  const response = page.waitForResponse(r => new URL(r.url()).pathname === "/dashboard" && r.request().method() === "POST");
  await page.getByRole("button", { name: "전환", exact: true }).click();
  await response;
  await page.waitForFunction(expected => document.querySelector('#workspace-select')?.value === expected, id);
  await page.waitForLoadState("networkidle");
  assert.equal((await required(db.from("profiles").select("organization_id").eq("id", user.id).single())).organization_id, id);
}
async function verifyTab(page, id) {
  await page.waitForURL("**/dashboard", { timeout: 45000 });
  await page.waitForFunction(expected => document.querySelector('#workspace-select')?.value === expected, id, { timeout: 45000 });
  await page.waitForLoadState("networkidle");
  const expectedAdmin = membership.find(row => row.organization_id === id).role === "admin";
  assert.equal(await page.getByRole("navigation").locator('a[href="/manage"]').count(), expectedAdmin ? 1 : 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
}
async function record(id, run) {
  await run();
  results.push({ id, status: "PASS" });
  console.log(JSON.stringify({ engine, role, id, status: "PASS" }));
  await writeFile(path.join(output, "results.json"), JSON.stringify({ base, engine, role, results }, null, 2));
}

try {
  await required(client.rpc("switch_workspace", { p_organization_id: workspaceA }));
  const options = engine === "webkit" ? devices["iPhone 17 Pro Max"] : { viewport: { width: 1280, height: 900 } };
  const anonymous = await browser.newContext(options);
  const loginPage = await anonymous.newPage();
  await record("2-a-D", async () => {
    await visit(loginPage, "/");
    assert.equal(new URL(loginPage.url()).pathname, "/login");
    const guidance = loginPage.getByText("회원가입은 관리자 계정의 이메일 초대로만 가능합니다.", { exact: true });
    const forgot = loginPage.getByRole("link", { name: "비밀번호를 잊으셨나요?", exact: true });
    await guidance.waitFor();
    const g = await guidance.boundingBox();
    const f = await forgot.boundingBox();
    assert.ok(g.y > f.y + f.height);
    assert.equal(await loginPage.getByText("이미 비밀번호를 설정한 계정으로 로그인하세요.", { exact: true }).count(), 0);
    assert.equal(await loginPage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await loginPage.screenshot({ path: path.join(output, "login.png"), fullPage: true });
  });
  await anonymous.close();

  for (const variant of ["normal", "storage", "foreground"]) {
    await required(client.rpc("switch_workspace", { p_organization_id: workspaceA }));
    const context = await browser.newContext(options);
    if (variant !== "normal") await context.addInitScript(() => {
      Object.defineProperty(window, "BroadcastChannel", { value: undefined, configurable: true });
    });
    if (variant === "foreground") await context.addInitScript(() => {
      Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("QA storage denied", "SecurityError"); } });
      Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new DOMException("QA storage denied", "SecurityError"); } });
    });
    const control = await context.newPage();
    const watcher = await context.newPage();
    const editor = variant === "normal" ? await context.newPage() : null;
    for (const page of [control, watcher, ...(editor ? [editor] : [])]) {
      page.on("pageerror", error => errors.push({ variant, name: error.name }));
    }
    try {
      await login(control);
      await visit(watcher, "/courses");
      if (editor) {
        await visit(editor, `/courses/${fixture.created.course}/edit`);
        await editor.getByLabel("수업명", { exact: true }).fill("QA 미저장 입력 - 자동 저장 금지");
      }
      await control.bringToFront();
      await switchTo(control, workspaceB);
      if (variant === "foreground") {
        await watcher.bringToFront();
        await watcher.evaluate(() => window.dispatchEvent(new Event("focus")));
      }
      await verifyTab(watcher, workspaceB);
      if (editor) await verifyTab(editor, workspaceB);
      if (variant === "normal") await record("10-b-F", async () => {
        // Automatic UI navigation is not a security boundary: directly replay
        // an old A report request while the authenticated account selects B.
        const denied = await client.rpc("save_and_submit_report", {
          p_id: fixture.created.report, p_version: initialReport.updated_at,
          p_answers: [], p_submit: false,
        });
        assert.equal(denied.error?.code, "P0002");
        const after = await required(db.from("reports").select("updated_at,status").eq("id", fixture.created.report).single());
        assert.deepEqual(after, initialReport);
      });
      await visit(watcher, "/courses");
      assert.equal(await watcher.locator(`a[href="/courses/${fixture.created.course}"]`).count(), 0);
      assert.equal(await watcher.locator(`a[href="/courses/${fixture.created.courseB}"]`).count(), 1);
      await switchTo(control, workspaceA);
      if (variant === "foreground") {
        await watcher.bringToFront();
        await watcher.evaluate(() => window.dispatchEvent(new Event("focus")));
      }
      await verifyTab(watcher, workspaceA);
      if (editor) await verifyTab(editor, workspaceA);
      await visit(watcher, "/courses");
      assert.equal(await watcher.locator(`a[href="/courses/${fixture.created.course}"]`).count(), 1);
      assert.equal(await watcher.locator(`a[href="/courses/${fixture.created.courseB}"]`).count(), 0);
      await record(variant === "normal" ? "10-b-H" : `10-b-I-${variant}`, async () => {});
      if (editor) {
        await record("10-b-J", async () => {
          const after = await required(db.from("courses").select("title,updated_at").eq("id", fixture.created.course).single());
          assert.deepEqual(after, initialCourse);
        });
        await record("10-b-K", async () => {
          const old = watcher.url();
          const confirmation = watcher.waitForResponse(r => new URL(r.url()).pathname === "/api/workspaces/current");
          await control.evaluate(id => {
            const channel = new BroadcastChannel(`flag-edu-workspace:${id}`);
            channel.postMessage("workspace-changed");
            channel.close();
            window.localStorage.setItem(`flag-edu-workspace:unrelated-user`, "forged hint");
          }, user.id);
          await confirmation;
          await watcher.waitForLoadState("networkidle");
          assert.equal(watcher.url(), old);
          assert.equal(await watcher.getByLabel("워크스페이스", { exact: true }).inputValue(), workspaceA);
        });
      }
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, [], "Uncaught page errors");
} catch (error) {
  failure = { name: error.name, message: error.message.replace(/https?:\/\/[^\s]+/g, "[url]").replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, "[qa-id]") };
  console.log(JSON.stringify({ engine, role, status: "FAIL", failure }));
  process.exitCode = 1;
} finally {
  await browser.close();
  await required(client.rpc("switch_workspace", { p_organization_id: original.organization_id }));
  assert.equal((await required(db.from("profiles").select("organization_id").eq("id", user.id).single())).organization_id, original.organization_id);
  await writeFile(path.join(output, "results.json"), JSON.stringify({ base, engine, role, results, failure, originalWorkspaceRestored: true }, null, 2));
}
