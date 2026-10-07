import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

// Authorized development-only, stateful CRUD QA. Setup creates isolated accounts
// and workspaces; it does NOT send mail or clean up data. Secrets and artifacts
// are saved only under the ignored artifacts/aside directory.
// node --env-file=.env.local scripts/qa-workspace-crud.mjs <phase> <playwright-module-path>
const mode = process.argv[2] ?? "inspect";
const playwrightModule = process.argv[3];
if (!["setup", "inspect", "crud", "photos", "verify", "administration", "membership", "workspaces", "schedules", "schedule-retest", "lifecycle", "teardown", "additional", "onboarding", "smoke", "mobile", "mobile-image"].includes(mode) || !playwrightModule) {
  throw new Error("Specify a supported phase and the installed Playwright module path.");
}
const { chromium, webkit, devices } = await import(pathToFileURL(playwrightModule).href);
const deviceName = process.env.QA_DEVICE;
if (deviceName && !devices[deviceName]) throw new Error("Unknown installed Playwright device profile.");
const contextOptions = deviceName ? devices[deviceName] : { viewport: { width: 1280, height: 900 } };
const engine = deviceName ? contextOptions.defaultBrowserType : "chromium";
if (!["chromium", "webkit"].includes(engine)) throw new Error("Unsupported QA browser engine.");
const base = "http://localhost:3000";
const runName = process.env.QA_RUN_NAME ?? "workspace-crud-20261007";
if (!/^[a-z0-9-]+$/.test(runName)) throw new Error("Run name must be a single safe directory name.");
const artifactDir = path.resolve("artifacts/aside", runName);
await mkdir(artifactDir, { recursive: true });
const fixtureFile = path.join(artifactDir, "private-fixture.json");
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname !== "vhlrmudatjcgspwltdix.supabase.co") {
  throw new Error("This suite is restricted to the approved development project.");
}
const required = async (query) => {
  const result = await query;
  if (result.error) throw new Error(`${result.error.code ?? ""}: ${result.error.message}`);
  return result.data;
};
let fixture;
if (mode === "setup") {
  const existing = await readFile(fixtureFile, "utf8").then(JSON.parse, () => null);
  if (existing && (process.env.QA_RESUME_SETUP !== "1" || existing.environment || Object.keys(existing.created).length)) throw new Error("An existing QA fixture is present; resume its phases instead of overwriting credentials.");
  if (existing && !process.env.QA_REUSE_RUN) throw new Error("Only a tagged-account reuse setup can be resumed automatically.");
  const prefix = existing?.prefix ?? `QA-WS-CRUD-${Date.now()}`;
  assert.match(prefix, /^QA-WS-CRUD-\d+$/);
  fixture = existing ?? { prefix, users: {}, created: {}, results: [] };
  const organization = existing?.organization ?? await required(db.from("organizations").insert({ name: `${prefix}-A` }).select("id,name").single());
  assert.equal(organization.name, `${prefix}-A`);
  fixture.organization = organization;
  await writeFile(fixtureFile, JSON.stringify(fixture));
  const reuseRun = process.env.QA_REUSE_RUN;
  if (reuseRun && !/^[a-z0-9-]+$/.test(reuseRun)) throw new Error("Invalid QA source run.");
  const previous = reuseRun ? JSON.parse(await readFile(path.resolve("artifacts/aside", reuseRun, "private-fixture.json"), "utf8")) : null;
  for (const role of ["admin", "coach", "other"]) {
    if (previous) {
      const user = previous.users[role];
      assert.equal((await required(db.auth.admin.getUserById(user.id))).user.user_metadata.qa_fixture, true, "Only explicitly tagged QA accounts may be reused.");
      fixture.users[role] = user;
      await writeFile(fixtureFile, JSON.stringify(fixture));
      const membership = await required(db.from("workspace_memberships").select("user_id").eq("user_id", user.id).eq("organization_id", organization.id).maybeSingle());
      if (!membership) await required(db.from("workspace_memberships").insert({ user_id: user.id, organization_id: organization.id, role: role === "admin" ? "admin" : "coach", status: "active" }));
      const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      await required(client.auth.signInWithPassword({ email: user.email, password: user.password }));
      await required(client.rpc("switch_workspace", { p_organization_id: organization.id }));
      continue;
    }
    const password = randomBytes(24).toString("base64url");
    const email = `${prefix.toLowerCase()}-${role}@example.com`;
    const data = await required(db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { qa_fixture: true } }));
    fixture.users[role] = { id: data.user.id, email, password };
    await writeFile(fixtureFile, JSON.stringify(fixture));
    await required(db.from("profiles").insert({ id: data.user.id, organization_id: organization.id, name: `QA ${role}`, role: role === "admin" ? "admin" : "coach", status: "active" }));
    await required(db.from("workspace_memberships").insert({ user_id: data.user.id, organization_id: organization.id, role: role === "admin" ? "admin" : "coach", status: "active" }));
  }
} else {
  fixture = JSON.parse(await readFile(fixtureFile, "utf8"));
}

fixture.environment = { engine, deviceName: deviceName ?? "Desktop Chrome", viewport: contextOptions.viewport, screen: contextOptions.screen, deviceScaleFactor: contextOptions.deviceScaleFactor ?? 1, isMobile: contextOptions.isMobile ?? false, hasTouch: contextOptions.hasTouch ?? false };
fixture.executions ??= [];
fixture.executions.push({ phase: mode, startedAt: new Date().toISOString(), environment: fixture.environment });
const browser = engine === "webkit" ? await webkit.launch({ headless: true }) : await chromium.launch({ channel: "chrome", headless: true });
const contexts = {};
const pages = {};
for (const role of ["admin", "coach", "other"]) {
  const stateFile = path.join(artifactDir, `private-${role}-state.json`);
  const context = await browser.newContext({ ...contextOptions, ...(mode === "setup" ? {} : { storageState: stateFile }) });
  contexts[role] = context;
  const page = await context.newPage();
  pages[role] = page;
  if (mode === "setup") {
    await page.goto(`${base}/login`);
    await page.locator('[name="email"]').fill(fixture.users[role].email);
    await page.locator('[name="password"]').fill(fixture.users[role].password);
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await page.waitForURL("**/dashboard", { timeout: 30000 });
    await context.storageState({ path: stateFile });
  }
}

async function observe(role, route, name) {
  const page = pages[role];
  await page.goto(`${base}${route}`);
  await page.getByRole("heading", { level: 1 }).waitFor({ timeout: 30000 });
  await page.screenshot({ path: path.join(artifactDir, `${name}.png`), fullPage: true });
  console.log(JSON.stringify({ name, role, url: new URL(page.url()).pathname, text: (await page.locator("body").innerText()).slice(0, 9000) }));
}

async function step(name, run) {
  try {
    const detail = await run();
    fixture.results.push({ name, status: "PASS", detail, environment: fixture.environment });
    console.log(JSON.stringify({ name, status: "PASS", detail }));
  } catch (error) {
    fixture.results.push({ name, status: "FAIL", error: error.message, environment: fixture.environment });
    console.log(JSON.stringify({ name, status: "FAIL", error: error.message }));
    const failureId = Date.now();
    for (const [role, page] of Object.entries(pages)) {
      await page.screenshot({ path: path.join(artifactDir, `failure-${failureId}-${role}.png`), fullPage: true }).catch(() => {});
    }
    throw error;
  } finally {
    await writeFile(fixtureFile, JSON.stringify(fixture));
    await writeFile(path.join(artifactDir, "results.json"), JSON.stringify(fixture.results, null, 2));
  }
}

async function navigate(page, route) {
  await page.goto(`${base}${route}`);
  await page.getByRole("heading", { level: 1 }).waitFor({ timeout: 30000 });
  // Dev-server lazy bundles can paint the server heading before client controls
  // hydrate. Wait for those requests to settle, not merely the static heading.
  await page.waitForLoadState("networkidle", { timeout: 30000 });
}

async function openFilters(page) {
  // URL changes before the new RSC filter state has committed. Wait before
  // reading aria-expanded so we do not inspect the outgoing component.
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  const button = page.getByRole("button", { name: "필터", exact: true });
  if (await button.getAttribute("aria-expanded") === "false") {
    if (deviceName) await button.tap();
    else await button.click();
  }
  await page.locator('button[aria-expanded="true"]').filter({ hasText: "필터" }).waitFor();
}

const a = pages.admin;
const c = pages.coach;
const o = pages.other;

async function switchTo(page, role, id) {
  await navigate(page, "/dashboard");
  const current = await required(db.from("profiles").select("organization_id").eq("id", fixture.users[role].id).single());
  if (current.organization_id !== id) {
    await page.getByLabel("워크스페이스", { exact: true }).selectOption(id);
    const response = page.waitForResponse(r => new URL(r.url()).pathname === "/dashboard" && r.request().method() === "POST");
    await page.getByRole("button", { name: "전환", exact: true }).click();
    await response;
    await page.waitForURL("**/dashboard");
    await page.getByRole("heading", { level: 1 }).waitFor();
  }
  const saved = await required(db.from("profiles").select("organization_id").eq("id", fixture.users[role].id).single());
  assert.equal(saved.organization_id, id);
}

async function manageQaMember(page, name, role, status) {
  await navigate(page, "/members");
  const member = page.locator("main li").filter({ hasText: name });
  if ((await member.locator("details").getAttribute("open")) === null) await member.locator("summary").click();
  await member.locator('select[name="role"]').selectOption(role);
  await member.locator('select[name="status"]').selectOption(status);
  await member.getByLabel("변경 확인").check();
  await member.getByRole("button", { name: "적용", exact: true }).click();
  await member.getByRole("status").filter({ hasText: "변경했습니다" }).waitFor();
}

try {
  if (mode === "setup" || mode === "inspect") {
    await observe("admin", "/dashboard", "admin-dashboard");
    await observe("admin", "/templates/new", "template-new");
    await observe("coach", "/courses/new", "course-new");
    await observe("admin", "/workspaces", "workspaces");
    await observe("coach", "/manage", "coach-manage-denied");
  }
  if (mode === "crud") {
    if (!fixture.created.template) await step("template draft/create/publish", async () => {
      const existingDraft = await required(db.from("template_versions").select("id").eq("organization_id", fixture.organization.id).eq("name", `${fixture.prefix}-양식`).eq("status", "draft").maybeSingle());
      if (!existingDraft) {
      await navigate(a, "/templates/new");
      await a.getByLabel("양식 이름").fill(`${fixture.prefix}-양식`);
      for (const [label, type] of [["수업 내용", "short_text"], ["활동 의견", "long_text"], ["점수", "number"], ["활동 날짜", "date"], ["만족도", "single_select"], ["활동 분야", "multi_select"], ["활동 사진", "photo"]]) {
        await a.getByRole("button", { name: "항목 추가", exact: true }).click();
        const section = a.locator("form section").last();
        await section.getByLabel("항목명", { exact: true }).fill(label);
        await section.getByLabel("입력 유형").selectOption(type);
        if (label === "수업 내용") await section.getByLabel("필수 항목").check();
        if (["single_select", "multi_select"].includes(type)) {
          for (const option of type === "single_select" ? ["좋음", "보통"] : ["협동", "체력"]) {
            await section.getByRole("button", { name: "+ 선택지 추가" }).click();
            await section.locator('input[aria-label*="선택지"]').last().fill(option);
          }
        }
      }
      await a.getByRole("button", { name: "임시 저장", exact: true }).click();
      await a.waitForURL("**/templates");
      await a.getByRole("link", { name: "수정", exact: true }).click();
      } else {
        await navigate(a, `/templates/${existingDraft.id}`);
      }
      await a.getByLabel("게시하면 새 보고서에 이 양식을 사용합니다.").check();
      await a.getByRole("button", { name: "수정 완료", exact: true }).click();
      await a.waitForURL("**/templates");
      await a.getByText("사용 중", { exact: true }).waitFor();
      const template = await required(db.from("template_versions").select("id,group_id").eq("organization_id", fixture.organization.id).eq("status", "active").single());
      fixture.created.template = template.id;
      fixture.created.group = template.group_id;
      return "7 input types and row-based choices published";
    });
    if (!fixture.created.course) await step("coach course create/read/update", async () => {
      await navigate(c, "/courses/new");
      await c.getByLabel("수업명", { exact: true }).fill(`${fixture.prefix}-체육`);
      await c.getByLabel("장소 또는 기관명").fill("QA 체육관");
      await c.getByLabel("수업 진행방식 (선택)").fill("준비운동 → 협동 활동 → 마무리");
      await c.getByLabel("메모 (선택)").fill("통합 테스트 전용");
      await c.getByRole("button", { name: "수업 등록", exact: true }).click();
      await c.waitForURL(/\/courses\/[0-9a-f-]+$/);
      fixture.created.course = new URL(c.url()).pathname.split("/").pop();
      await c.getByRole("link", { name: "수업 수정", exact: true }).click();
      await c.getByLabel("장소 또는 기관명").fill("QA 수정 체육관");
      await c.getByRole("button", { name: "수업 수정", exact: true }).click();
      await c.waitForURL(`**/courses/${fixture.created.course}`);
      await c.getByText("QA 수정 체육관", { exact: true }).waitFor();
      return fixture.created.course;
    });
    if (!fixture.created.session) await step("coach schedule create/read/update", async () => {
      await navigate(c, `/classes/new?course=${fixture.created.course}`);
      await c.getByRole("button", { name: "다음 →" }).click();
      await c.getByLabel("수업 날짜", { exact: true }).fill("2026-10-09");
      await c.getByRole("button", { name: "다음 →" }).click();
      assert.equal(await c.getByRole("button", { name: "1개 수업 등록" }).count(), 1);
      await c.getByRole("button", { name: "1개 수업 등록" }).click();
      await c.waitForURL(/\/classes\/[0-9a-f-]+$/);
      fixture.created.session = new URL(c.url()).pathname.split("/").pop();
      await c.getByRole("link", { name: "수업 수정", exact: true }).click();
      await c.getByRole("button", { name: "다음 →" }).click();
      await c.getByLabel("수업 날짜", { exact: true }).fill("2026-10-10");
      await c.getByRole("button", { name: "다음 →" }).click();
      await c.getByRole("button", { name: "수정 저장" }).click();
      await c.waitForURL(`**/classes/${fixture.created.session}`);
      await c.getByRole("heading", { level: 1 }).waitFor();
      const saved = await required(db.from("class_sessions").select("start_at").eq("id", fixture.created.session).single());
      assert.equal(new Date(new Date(saved.start_at).getTime() + 9 * 3600000).toISOString().slice(0, 10), "2026-10-10");
      return fixture.created.session;
    });
    if (!fixture.created.report) await step("coach report draft/required validation/update", async () => {
      await navigate(c, `/classes/${fixture.created.session}`);
      await c.getByRole("button", { name: "보고서 작성", exact: true }).click();
      await c.waitForURL(/\/reports\/[0-9a-f-]+\?edit=1/);
      fixture.created.report = new URL(c.url()).pathname.split("/").pop();
      await c.getByRole("button", { name: "제출", exact: true }).click();
      await c.getByRole("alert").filter({ hasText: "수업 내용" }).waitFor();
      await c.getByLabel("수업 내용", { exact: false }).fill("협동 달리기 활동을 진행했습니다.");
      await c.getByLabel("활동 의견").fill("규칙을 스스로 정하고 협동했습니다.\n다음 시간에는 팀 구성을 바꾸어 진행합니다.");
      await c.getByLabel("점수").fill("0");
      await c.getByLabel("활동 날짜").fill("2026-10-10");
      await c.getByLabel("만족도").selectOption("좋음");
      await c.getByLabel("협동", { exact: true }).check();
      await c.getByLabel("체력", { exact: true }).check();
      await c.getByRole("button", { name: "임시저장", exact: true }).click();
      await c.getByRole("status").filter({ hasText: "저장했습니다." }).waitFor();
      await c.reload();
      assert.equal(await c.getByLabel("점수").inputValue(), "0");
      assert.equal(await c.getByLabel("협동", { exact: true }).isChecked(), true);
      return fixture.created.report;
    });
    await observe("coach", `/reports/${fixture.created.report}?edit=1`, "report-edit-ready");
  }
  if (mode === "photos") {
    await step("photo upload then immediate report submit", async () => {
      await navigate(c, `/reports/${fixture.created.report}?edit=1`);
      const { default: sharp } = await import("sharp");
      const buffer = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: "#87c9a5" } }).jpeg({ quality: 95 }).toBuffer();
      const started = Date.now();
      const responsePromise = c.waitForResponse(response => response.url().endsWith(`/api/reports/${fixture.created.report}/photos`) && response.request().method() === "POST");
      await c.getByLabel("활동 사진 선택").setInputFiles({ name: "qa-solid.jpg", mimeType: "image/jpeg", buffer });
      const response = await responsePromise;
      assert.equal(response.status(), 200);
      await c.getByRole("img", { name: "활동 사진 1", exact: true }).waitFor();
      const uploadMs = Date.now() - started;
      await c.getByRole("button", { name: "제출", exact: true }).click();
      try {
        await c.waitForURL("**/reports", { timeout: 10000 });
      } catch {
        throw new Error(`After successful upload (${uploadMs}ms): ${await c.getByRole("alert").allTextContents()}`);
      }
      return { uploadMs };
    });
  }
  if (mode === "verify") {
    await step("schedule persisted read and creator/admin edit permissions", async () => {
      const session = await required(db.from("class_sessions").select("start_at,status,created_by").eq("id", fixture.created.session).single());
      assert.equal(new Date(new Date(session.start_at).getTime() + 9 * 3600000).toISOString().slice(0,10), "2026-10-10");
      assert.equal(session.created_by, fixture.users.coach.id);
      await navigate(o, `/classes/${fixture.created.session}/edit`);
      assert.match(await o.locator("body").innerText(), /수정 권한이 없습니다/);
      await navigate(a, `/courses/${fixture.created.course}/edit`);
      await a.getByLabel("메모 (선택)").fill("관리자가 수정한 QA 메모");
      await a.getByRole("button", { name: "수업 수정", exact: true }).click();
      await a.waitForURL(`**/courses/${fixture.created.course}`);
      await a.getByText("관리자가 수정한 QA 메모", { exact: true }).waitFor();
      return "coach-owned course edited by admin; other coach denied";
    });
    await step("photo in-app delete then draft save without reload", async () => {
      await navigate(c, `/reports/${fixture.created.report}?edit=1`);
      const before = await c.getByRole("img", { name: /^활동 사진 \d+$/ }).count();
      await c.getByRole("button", { name: "활동 사진 1 삭제", exact: true }).click();
      const dialog = c.getByRole("dialog", { name: "사진을 삭제할까요?" });
      await dialog.waitFor();
      await dialog.getByRole("button", { name: "삭제", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await c.getByRole("img", { name: /^활동 사진 \d+$/ }).count(), before - 1);
      await c.getByLabel("수업 내용", { exact: false }).fill("사진 삭제 후 수정한 보고서");
      await c.getByRole("button", { name: "임시저장", exact: true }).click();
      await c.getByRole("status").filter({ hasText: "저장했습니다." }).waitFor();
      await c.getByRole("button", { name: "제출", exact: true }).click();
      await c.waitForURL("**/reports");
      return { before, after: before - 1 };
    });
    await step("admin edits another author's answers and immediately resubmits", async () => {
      await navigate(a, `/reports/${fixture.created.report}?edit=1`);
      await a.getByLabel("수업 내용", { exact: false }).fill("관리자 보완: 협동 활동 완료");
      await a.getByRole("button", { name: "임시저장", exact: true }).click();
      await a.getByRole("status").filter({ hasText: "저장했습니다." }).waitFor();
      await a.getByRole("button", { name: "제출", exact: true }).click();
      await a.waitForURL("**/reports");
      const report = await required(db.from("reports").select("status,author_id").eq("id", fixture.created.report).single());
      assert.equal(report.status, "submitted");
      assert.equal(report.author_id, fixture.users.coach.id);
      return "author preserved; submitted";
    });
    await step("Excel and PDF UI download without server retention", async () => {
      await navigate(a, "/exports");
      await a.getByLabel("수업 (최근 200개)").selectOption(fixture.created.session);
      const artifacts = [];
      for (const format of ["xlsx", "pdf"]) {
        await a.getByLabel("파일 형식").selectOption(format);
        const pendingDownload = a.waitForEvent("download", { timeout: 30000 });
        await a.getByRole("button", { name: "생성 및 다운로드", exact: true }).click();
        const download = await pendingDownload;
        const artifact = path.join(artifactDir, `report.${format}`);
        await download.saveAs(artifact);
        if (format === "xlsx") {
          const { default: ExcelJS } = await import("exceljs");
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.readFile(artifact);
          const values = JSON.stringify(workbook.worksheets[0].getSheetValues());
          assert.match(values, /관리자 보완: 협동 활동 완료/);
          assert.match(values, /좋음/);
          assert.match(values, /협동/);
        } else {
          const { PDFDocument } = await import("pdf-lib");
          const pdf = await PDFDocument.load(await readFile(artifact));
          assert.ok(pdf.getPageCount() > 0);
          assert.match((await readFile(artifact)).subarray(0,8).toString(), /%PDF-/);
          artifacts.push({ format, pages: pdf.getPageCount() });
        }
      }
      const jobs = await required(db.from("export_jobs").select("id").eq("organization_id", fixture.organization.id));
      assert.equal(jobs.length, 0);
      return artifacts;
    });
    await step("same-workspace other coach report and export access denied", async () => {
      await o.goto(`${base}/reports/${fixture.created.report}?edit=1`);
      await o.getByText("This page could not be found.").waitFor();
      const response = await contexts.other.request.post(`${base}/api/exports`, { headers: { origin: base }, multipart: { format: "pdf", session: fixture.created.session } });
      assert.equal(response.status(), 403);
      const deletion = await contexts.other.request.delete(`${base}/api/reports/${fixture.created.report}/photos`, { headers: { origin: base }, data: { id: "10000000-0000-4000-8000-000000000001" } });
      assert.equal(deletion.status(), 403);
      return "report 404; export/photo mutation 403";
    });
  }
  if (mode === "verify" || mode === "administration" || mode === "membership") {
    await step("member role/status update and active-session enforcement", async () => {
      await navigate(a, "/members");
      async function manage(role, status) {
        const member = a.locator("main li").filter({ hasText: "QA other" });
        if ((await member.locator("details").getAttribute("open")) === null) await member.locator("summary").click();
        await member.locator('select[name="role"]').selectOption(role);
        await member.locator('select[name="status"]').selectOption(status);
        await member.getByLabel("변경 확인").check();
        await member.getByRole("button", { name: "적용", exact: true }).click();
        await member.getByRole("status").filter({ hasText: "변경했습니다." }).waitFor();
        await a.reload();
        await a.getByRole("heading", { level: 1 }).waitFor();
      }
      await manage("admin", "active");
      await switchTo(o, "other", fixture.organization.id);
      await navigate(o, "/manage");
      assert.equal(new URL(o.url()).pathname, "/manage");
      await manage("coach", "inactive");
      await o.goto(`${base}/dashboard`);
      const otherMemberships = await required(db.from("workspace_memberships").select("organization_id").eq("user_id", fixture.users.other.id).eq("status", "active").neq("organization_id", fixture.organization.id));
      if (otherMemberships.length) {
        // Reused QA accounts may have another active workspace: revoking A
        // must not incorrectly disable their unrelated memberships.
        await o.getByRole("heading", { level: 1 }).waitFor();
        const selected = await required(db.from("profiles").select("organization_id").eq("id", fixture.users.other.id).single());
        assert.notEqual(selected.organization_id, fixture.organization.id);
        // Class detail was readable as an active A coach; unlike someone
        // else's report, this proves the newly revoked workspace is denied.
        await o.goto(`${base}/classes/${fixture.created.session}`);
        await o.getByRole("heading", { name: "수업을 찾을 수 없습니다", exact: true }).waitFor();
        await o.goto(`${base}/reports/${fixture.created.report}`);
        await o.getByText("This page could not be found.").waitFor();
      } else {
        await o.waitForURL("**/access-denied");
      }
      await manage("coach", "active");
      await switchTo(o, "other", fixture.organization.id);
      assert.equal(new URL(o.url()).pathname, "/dashboard");
      return { qaOnly: true, promoted: true, deactivatedScopeDenied: true, otherActiveWorkspacesPreserved: otherMemberships.length > 0, restored: true };
    });
  }
  if (mode === "verify" || mode === "administration") {
    await step("template logical update preserves past report version", async () => {
      await navigate(a, "/templates");
      await a.getByRole("link", { name: "조회 / 수정" }).click();
      await a.getByLabel("양식 이름").fill(`${fixture.prefix}-양식 수정`);
      await a.getByLabel("게시하면 새 보고서에 이 양식을 사용합니다.").check();
      await a.getByRole("button", { name: "수정 완료", exact: true }).click();
      await a.waitForURL("**/templates");
      const report = await required(db.from("reports").select("template_version_id").eq("id", fixture.created.report).single());
      assert.equal(report.template_version_id, fixture.created.template);
      fixture.created.newTemplate = (await required(db.from("template_versions").select("id").eq("organization_id", fixture.organization.id).eq("status", "active").single())).id;
      assert.notEqual(fixture.created.newTemplate, fixture.created.template);
      await navigate(c, `/reports/${fixture.created.report}`);
      await c.getByText("관리자 보완: 협동 활동 완료", { exact: true }).waitFor();
      return "new version active; original report preserved";
    });
  }
  if (mode === "workspaces") {
    await step("workspace UI create and empty tenant", async () => {
      if (!fixture.created.workspaceB) {
        await switchTo(a, "admin", fixture.organization.id);
        await navigate(a, "/workspaces");
        await a.getByLabel("워크스페이스 이름").fill(`${fixture.prefix}-B`);
        await a.getByRole("button", { name: "워크스페이스 만들기" }).click();
        await a.waitForURL("**/dashboard");
        fixture.created.workspaceB = (await required(db.from("profiles").select("organization_id").eq("id", fixture.users.admin.id).single())).organization_id;
      }
      await switchTo(a, "admin", fixture.created.workspaceB);
      assert.notEqual(fixture.created.workspaceB, fixture.organization.id);
      await navigate(a, "/courses");
      assert.equal(await a.locator(`a[href="/courses/${fixture.created.course}"]`).count(), 0);
      await navigate(a, "/admin-reports");
      assert.equal(await a.locator(`a[href="/reports/${fixture.created.report}"]`).count(), 0);
      await navigate(a, "/templates");
      assert.equal(await a.getByText(`${fixture.prefix}-양식 수정`, { exact: true }).count(), 0);
      return "A course/report/template absent from B";
    });
    await step("existing-account invitation without duplicate auth user or mail", async () => {
      const member = await required(db.from("workspace_memberships").select("user_id").eq("organization_id", fixture.created.workspaceB).eq("user_id", fixture.users.coach.id).maybeSingle());
      await navigate(a, "/members");
      await a.getByLabel("이름", { exact: true }).fill("QA coach");
      await a.getByLabel("이메일", { exact: true }).fill(fixture.users.coach.email);
      await a.getByRole("button", { name: "코치 초대", exact: true }).click();
      if (member) await a.getByRole("alert").filter({ hasText: "이미 현재 워크스페이스" }).waitFor();
      else await a.getByRole("status").filter({ hasText: "워크스페이스에 추가했습니다" }).waitFor();
      const memberships = await required(db.from("workspace_memberships").select("role,status").eq("user_id", fixture.users.coach.id).in("organization_id", [fixture.organization.id, fixture.created.workspaceB]));
      assert.equal(memberships.length, 2);
      const user = await required(db.auth.admin.getUserById(fixture.users.coach.id));
      assert.equal(user.user.email, fixture.users.coach.email);
      await manageQaMember(a, "QA coach", "admin", "active");
      return "same account joins A as coach and B as admin";
    });
    await step("workspace switch role, author filters and stale-tab isolation", async () => {
      await switchTo(c, "coach", fixture.organization.id);
      await navigate(c, `/reports/${fixture.created.report}?edit=1`);
      await c.getByLabel("수업 내용", { exact: false }).fill("이 값은 다른 워크스페이스에서 저장되면 안 됩니다");
      const before = await required(db.from("reports").select("updated_at").eq("id", fixture.created.report).single());
      const fresh = await contexts.coach.newPage();
      await switchTo(fresh, "coach", fixture.created.workspaceB);
      await navigate(fresh, "/manage");
      assert.equal(new URL(fresh.url()).pathname, "/manage");
      await switchTo(a, "admin", fixture.organization.id);
      await navigate(a, "/exports");
      assert.equal(await a.locator(`select[name="author"] option[value="${fixture.users.coach.id}"]`).count(), 1);
      await navigate(a, "/admin-reports");
      await a.getByRole("button", { name: "필터", exact: true }).click();
      assert.equal(await a.locator(`select[name="author"] option[value="${fixture.users.coach.id}"]`).count(), 1);
      await a.locator('select[name="author"]').selectOption(fixture.users.coach.id);
      await a.getByRole("button", { name: "조회", exact: true }).click();
      await a.locator(`a[href="/reports/${fixture.created.report}"]`).waitFor();
      await c.waitForURL("**/dashboard", { timeout: 45000 });
      const staleClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      await required(staleClient.auth.signInWithPassword({ email: fixture.users.coach.email, password: fixture.users.coach.password }));
      const staleSave = await staleClient.rpc("save_and_submit_report", { p_id: fixture.created.report, p_version: before.updated_at, p_answers: [], p_submit: false });
      assert.equal(staleSave.error?.code, "P0002");
      const after = await required(db.from("reports").select("updated_at").eq("id", fixture.created.report).single());
      assert.equal(before.updated_at, after.updated_at);
      await fresh.goto(`${base}/reports/${fixture.created.report}`);
      await fresh.getByText("This page could not be found.").waitFor();
      const response = await contexts.coach.request.delete(`${base}/api/reports/${fixture.created.report}/photos`, { headers: { origin: base }, data: { id: "10000000-0000-4000-8000-000000000001" } });
      assert.equal(response.status(), 403);
      await switchTo(fresh, "coach", fixture.organization.id);
      await navigate(fresh, "/manage");
      assert.equal(new URL(fresh.url()).pathname, "/dashboard");
      await fresh.close();
      return "B admin cannot read/mutate A; A author remains filterable; switching back restores coach role";
    });
    await step("non-member workspace switch rejected by live RPC", async () => {
      const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      await required(client.auth.signInWithPassword({ email: fixture.users.other.email, password: fixture.users.other.password }));
      const response = await client.rpc("switch_workspace", { p_organization_id: fixture.created.workspaceB });
      assert.equal(response.error?.code, "42501");
      const bypass = await client.rpc("change_member_status", { p_user_id: fixture.users.other.id, p_status: "active" });
      assert.equal(bypass.error?.code, "42501");
      await navigate(o, "/dashboard");
      const profile = await required(db.from("profiles").select("organization_id").eq("id", fixture.users.other.id).single());
      assert.equal(profile.organization_id, fixture.organization.id);
      return "non-member switch 42501; helper RPC unavailable to authenticated account";
    });
  }
  if (mode === "schedules") {
    await switchTo(c, "coach", fixture.organization.id);
    await switchTo(a, "admin", fixture.organization.id);
    await step("coach repeat schedule and admin past-day completed schedule", async () => {
      if (!fixture.created.repeatSessions) {
        await navigate(c, `/classes/new?course=${fixture.created.course}`);
        await c.getByRole("button", { name: "다음 →" }).click();
        await c.locator("main form select").selectOption("day");
        await c.getByLabel("반복 시작일", { exact: true }).fill("2026-10-11");
        await c.getByLabel("반복 종료일", { exact: true }).fill("2026-10-12");
        await c.getByRole("button", { name: "다음 →" }).click();
        await c.getByRole("button", { name: "2개 수업 등록", exact: true }).click();
        await c.waitForURL(/\/classes\/[0-9a-f-]+$/);
        fixture.created.repeatSessions = (await required(db.from("class_sessions").select("id").eq("organization_id", fixture.organization.id).gte("start_at", "2026-10-11T00:00:00+09:00").lt("start_at", "2026-10-13T00:00:00+09:00"))).map(r => r.id);
      }
      assert.equal(fixture.created.repeatSessions.length, 2);
      if (!fixture.created.completedSession) {
        await navigate(a, `/classes/new?course=${fixture.created.course}`);
        await a.getByRole("button", { name: "다음 →" }).click();
        await a.getByLabel("수업 날짜", { exact: true }).fill("2026-10-05");
        await a.getByRole("button", { name: "다음 →" }).click();
        await a.getByRole("button", { name: "1개 수업 등록", exact: true }).click();
        await a.waitForURL(/\/classes\/[0-9a-f-]+$/);
        fixture.created.completedSession = new URL(a.url()).pathname.split("/").pop();
      }
      await navigate(a, `/classes/${fixture.created.completedSession}`);
      await a.getByText("완료", { exact: true }).waitFor();
      const completed = await required(db.from("class_sessions").select("status,created_by").eq("id", fixture.created.completedSession).single());
      assert.equal(completed.status, "completed");
      assert.equal(completed.created_by, fixture.users.admin.id);
      return "2 repeat dates; past admin schedule stored as completed";
    });
    await step("schedule sort, status/date filters and reset", async () => {
      for (const sort of ["newest", "oldest"]) {
        await navigate(c, `/classes?view=list&sort=${sort}`);
        const ids = await c.locator('main a[href^="/classes/"]').evaluateAll(nodes => nodes.map(n => n.getAttribute("href").split("/").pop()).filter(id => /^[0-9a-f-]{36}$/.test(id)));
        const expected = await required(db.from("class_sessions").select("id").eq("organization_id", fixture.organization.id).order("start_at", { ascending: sort === "oldest" }).order("id", { ascending: sort === "oldest" }));
        assert.deepEqual(ids, expected.map(row => row.id));
      }
      await c.getByRole("button", { name: "필터", exact: true }).click();
      await c.getByLabel("조회 시작일").fill("2026-10-05");
      await c.getByLabel("조회 종료일").fill("2026-10-05");
      await c.locator('select[name="status"]').selectOption("completed");
      await c.getByRole("button", { name: "조회", exact: true }).click();
      await c.waitForURL(/status=completed/);
      await c.locator(`a[href="/classes/${fixture.created.completedSession}"]`).waitFor();
      assert.equal(await c.locator(`a[href="/classes/${fixture.created.session}"]`).count(), 0);
      await openFilters(c);
      await c.getByRole("link", { name: "필터 초기화", exact: true }).click();
      await c.waitForURL("**/classes?view=list&sort=newest");
      await openFilters(c);
      assert.equal(await c.getByLabel("조회 시작일").inputValue(), "");
      assert.equal(await c.getByLabel("조회 종료일").inputValue(), "");
      assert.equal(await c.locator('select[name="status"]').inputValue(), "all");
      assert.equal(await c.locator('select[name="sort"]').inputValue(), "newest");
      assert.match(await c.locator(`a[href="/classes/${fixture.created.completedSession}"]`).getByText("완료", { exact: true }).getAttribute("class"), /emerald/);
      assert.match(await c.locator(`a[href="/classes/${fixture.created.session}"]`).getByText("예정", { exact: true }).getAttribute("class"), /amber/);
      return "newest/oldest match DB; date inclusive; reset clears all fields";
    });
    await step("calendar selected day, view persistence and mobile layout", async () => {
      await navigate(c, "/classes?view=calendar");
      assert.equal(await c.locator('a[aria-current="date"]').getAttribute("aria-label"), "10월 7일, 수업 0개");
      await c.getByRole("link", { name: "10월 10일, 수업 1개", exact: true }).click();
      await c.waitForURL(/date=2026-10-10/);
      const selected = c.getByRole("region", { name: "선택한 날짜의 수업 목록" });
      assert.equal(await selected.locator('a[href^="/classes/"]').count(), 1);
      await selected.locator(`a[href="/classes/${fixture.created.session}"]`).waitFor();
      await c.getByRole("link", { name: "목록", exact: true }).click();
      await c.waitForURL(/view=list/);
      await c.waitForLoadState("networkidle");
      await c.getByRole("link", { name: "캘린더", exact: true }).click();
      await c.waitForURL(/view=calendar/);
      await c.waitForLoadState("networkidle");
      await navigate(c, "/dashboard");
      await navigate(c, "/classes");
      assert.equal(await c.getByRole("link", { name: "캘린더", exact: true }).getAttribute("aria-current"), "page");
      await c.setViewportSize(deviceName ? contextOptions.viewport : { width: 390, height: 844 });
      for (const route of ["/classes?view=calendar&date=2026-10-10", "/classes?view=list", `/reports/${fixture.created.report}?edit=1`, "/courses"]) {
        await navigate(c, route);
        assert.equal(await c.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, route);
      }
      await c.screenshot({ path: path.join(artifactDir, "mobile-report.png"), fullPage: true });
      await c.setViewportSize(contextOptions.viewport);
      return { todayDefault: true, selectedDayOnly: true, viewPersists: true, checkedViewport: deviceName ? contextOptions.viewport : { width: 390, height: 844 } };
    });
  }
  if (mode === "mobile") {
    assert.equal(contextOptions.hasTouch, true, "Mobile phase requires a touch profile.");
    await switchTo(c, "coach", fixture.organization.id);
    await switchTo(a, "admin", fixture.organization.id);
    await step("mobile touch calendar and filters", async () => {
      await navigate(c, "/classes?view=calendar&date=2026-10-10");
      await c.getByRole("link", { name: "목록", exact: true }).tap();
      await c.waitForURL(/view=list/);
      await openFilters(c);
      await c.getByLabel("조회 시작일").fill("2026-10-10");
      await c.getByLabel("조회 종료일").fill("2026-10-10");
      await c.getByRole("button", { name: "조회", exact: true }).tap();
      await c.waitForURL(/from=2026-10-10/);
      await c.locator(`a[href="/classes/${fixture.created.session}"]`).waitFor();
      await openFilters(c);
      await c.getByRole("link", { name: "필터 초기화", exact: true }).tap();
      await c.waitForURL("**/classes?view=list&sort=newest");
      await c.getByRole("link", { name: "캘린더", exact: true }).tap();
      await c.waitForURL(/view=calendar/);
      await c.waitForLoadState("networkidle");
      await c.getByRole("link", { name: "10월 10일, 수업 1개", exact: true }).tap();
      await c.waitForURL(/date=2026-10-10/);
      const selected = c.getByRole("region", { name: "선택한 날짜의 수업 목록" });
      await selected.locator(`a[href="/classes/${fixture.created.session}"]`).waitFor();
      assert.equal(await selected.locator('a[href^="/classes/"]').count(), 1);
      await selected.locator(`a[href="/classes/${fixture.created.session}"]`).tap();
      await c.waitForURL(`**/classes/${fixture.created.session}`);
      return "Touch taps: list/filter/reset/calendar/date/detail; selected-day isolation";
    });
    await step("mobile shortened viewport form focus and draft save", async () => {
      await navigate(c, `/reports/${fixture.created.report}?edit=1`);
      await c.setViewportSize({ width: contextOptions.viewport.width, height: 420 });
      const input = c.getByLabel("활동 의견");
      await input.tap();
      await input.fill("모바일 화면에서 추가한 활동 의견");
      await c.getByRole("button", { name: "임시저장", exact: true }).tap();
      await c.getByRole("status").filter({ hasText: "저장했습니다" }).waitFor();
      assert.equal(await c.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await c.reload();
      assert.equal(await input.inputValue(), "모바일 화면에서 추가한 활동 의견");
      await c.setViewportSize(contextOptions.viewport);
      return "420px high viewport approximation (not a native iOS keyboard); focus/scroll/save/reload preserved";
    });
    await step("mobile network failure preserves report input and retry", async () => {
      await navigate(c, `/reports/${fixture.created.report}?edit=1`);
      const before = await required(db.from("reports").select("updated_at").eq("id", fixture.created.report).single());
      await c.getByLabel("활동 의견").fill("네트워크 실패 후에도 남아 있어야 하는 입력");
      const matcher = `${base}/reports/${fixture.created.report}*`;
      await c.route(matcher, async route => {
        if (route.request().method() === "POST") await route.abort("failed");
        else await route.continue();
      });
      await c.getByRole("button", { name: "임시저장", exact: true }).tap();
      await c.getByRole("alert").filter({ hasText: "입력 내용은 유지됩니다" }).waitFor();
      assert.equal(await c.getByLabel("활동 의견").inputValue(), "네트워크 실패 후에도 남아 있어야 하는 입력");
      assert.equal((await required(db.from("reports").select("updated_at").eq("id", fixture.created.report).single())).updated_at, before.updated_at);
      await c.unroute(matcher);
      await c.getByRole("button", { name: "임시저장", exact: true }).tap();
      await c.getByRole("status").filter({ hasText: "저장했습니다" }).waitFor();
      await c.reload();
      assert.equal(await c.getByLabel("활동 의견").inputValue(), "네트워크 실패 후에도 남아 있어야 하는 입력");
      return "Only this QA browser POST was aborted; error/input/DB preservation and successful retry checked";
    });
    await step("mobile photos max/order/dialog and image PDF download", async () => {
      await navigate(c, `/reports/${fixture.created.report}?edit=1`);
      const { default: sharp } = await import("sharp");
      const uploadMs = [];
      for (const [index, color] of ["#ec9a9a", "#97c7df", "#dfc797"].entries()) {
        const buffer = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: color } }).jpeg({ quality: 95 }).toBuffer();
        const started = Date.now();
        const response = c.waitForResponse(r => r.url().endsWith(`/api/reports/${fixture.created.report}/photos`) && r.request().method() === "POST");
        await c.getByLabel("활동 사진 선택").setInputFiles({ name: `qa-mobile-${index}.jpg`, mimeType: "image/jpeg", buffer });
        assert.equal((await response).status(), 200);
        await c.getByRole("img", { name: `활동 사진 ${index + 1}`, exact: true }).waitFor();
        uploadMs.push(Date.now() - started);
      }
      assert.equal(await c.getByLabel("활동 사진 선택").count(), 0);
      const rows = await required(db.from("report_attachments").select("id,storage_path").eq("report_id", fixture.created.report).order("created_at").order("id"));
      assert.equal(rows.length, 3);
      const srcs = await c.getByRole("img", { name: /^활동 사진 \d+$/ }).evaluateAll(images => images.map(img => decodeURIComponent(img.src)));
      rows.forEach((row, index) => assert.ok(srcs[index].includes(row.storage_path), "Upload order must match DB order."));
      await c.waitForFunction(() => [...document.querySelectorAll('img[alt^="활동 사진 "]')].every(img => img.complete && img.naturalWidth > 0));
      await c.getByRole("button", { name: "활동 사진 2 삭제", exact: true }).tap();
      const dialog = c.getByRole("dialog", { name: "사진을 삭제할까요?" });
      await dialog.waitFor();
      const box = await dialog.boundingBox();
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= contextOptions.viewport.width && box.y + box.height <= contextOptions.viewport.height);
      await c.screenshot({ path: path.join(artifactDir, "mobile-photo-dialog.png") });
      await dialog.getByRole("button", { name: "취소", exact: true }).tap();
      assert.equal((await required(db.from("report_attachments").select("id").eq("report_id", fixture.created.report))).length, 3);
      await c.getByRole("button", { name: "제출", exact: true }).tap();
      await c.waitForURL("**/reports");
      await navigate(a, "/exports");
      await a.getByLabel("수업 (최근 200개)").selectOption(fixture.created.session);
      await a.getByLabel("파일 형식").selectOption("pdf");
      const pendingDownload = a.waitForEvent("download", { timeout: 30000 });
      await a.getByRole("button", { name: "생성 및 다운로드", exact: true }).tap();
      const download = await pendingDownload;
      const output = path.join(artifactDir, "mobile-photos.pdf");
      await download.saveAs(output);
      const { PDFDocument, PDFName } = await import("pdf-lib");
      const pdf = await PDFDocument.load(await readFile(output));
      const imageCount = pdf.context.enumerateIndirectObjects().filter(([, object]) => object.dict?.get(PDFName.of("Subtype"))?.toString() === "/Image").length;
      assert.equal(imageCount, 3);
      assert.equal((await required(db.from("export_jobs").select("id").eq("organization_id", fixture.organization.id))).length, 0);
      await navigate(c, `/reports/${fixture.created.report}?edit=1`);
      for (let index = 0; index < 2; index++) {
        await c.getByRole("button", { name: "활동 사진 2 삭제", exact: true }).tap();
        await dialog.getByRole("button", { name: "삭제", exact: true }).tap();
        await dialog.waitFor({ state: "hidden" });
      }
      await c.getByRole("button", { name: "임시저장", exact: true }).tap();
      await c.getByRole("status").filter({ hasText: "저장했습니다" }).waitFor();
      assert.equal((await required(db.from("report_attachments").select("id").eq("report_id", fixture.created.report))).length, 1);
      return { uploadMs, pages: pdf.getPageCount(), imageCount, remainingPhotos: 1, cancelPreservedPhotos: true };
    });
  }
  if (mode === "lifecycle") {
    await switchTo(c, "coach", fixture.organization.id);
    await switchTo(a, "admin", fixture.organization.id);
    await step("concurrent report tabs preserve winning change", async () => {
      await navigate(c, `/reports/${fixture.created.report}?edit=1`);
      const second = await contexts.coach.newPage();
      await navigate(second, `/reports/${fixture.created.report}?edit=1`);
      await c.getByLabel("수업 내용", { exact: false }).fill("동시 수정의 최신 저장값");
      await c.getByRole("button", { name: "임시저장", exact: true }).click();
      await c.getByRole("status").filter({ hasText: "저장했습니다" }).waitFor();
      const before = await required(db.from("reports").select("updated_at").eq("id", fixture.created.report).single());
      await second.getByLabel("수업 내용", { exact: false }).fill("이전 탭의 덮어쓰기 금지값");
      await second.getByRole("button", { name: "임시저장", exact: true }).click();
      await second.getByRole("alert").filter({ hasText: "변경됐습니다" }).waitFor();
      assert.equal(await second.getByLabel("수업 내용", { exact: false }).inputValue(), "이전 탭의 덮어쓰기 금지값");
      const after = await required(db.from("reports").select("updated_at").eq("id", fixture.created.report).single());
      assert.equal(after.updated_at, before.updated_at);
      await second.close();
      return "stale save rejected; draft preserved; DB unchanged by loser";
    });
    await step("live attachment table and Storage RLS denial", async () => {
      const attachment = (await required(db.from("report_attachments").select("storage_path").eq("report_id", fixture.created.report)))[0];
      assert.ok(attachment);
      const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      await required(client.auth.signInWithPassword({ email: fixture.users.other.email, password: fixture.users.other.password }));
      assert.equal((await required(client.from("report_attachments").select("id").eq("report_id", fixture.created.report))).length, 0);
      assert.ok((await client.storage.from("report-images").download(attachment.storage_path)).error);
      await required(client.auth.signInWithPassword({ email: fixture.users.coach.email, password: fixture.users.coach.password }));
      await required(client.rpc("switch_workspace", { p_organization_id: fixture.created.workspaceB }));
      assert.equal((await required(client.from("reports").select("id").eq("id", fixture.created.report))).length, 0);
      assert.ok((await client.storage.from("report-images").download(attachment.storage_path)).error);
      await required(client.rpc("switch_workspace", { p_organization_id: fixture.organization.id }));
      return "other author and other active workspace cannot read private photo";
    });
    await step("admin deletes another author's photo and saves without reload", async () => {
      await navigate(a, `/reports/${fixture.created.report}?edit=1`);
      const before = await a.getByRole("img", { name: /^활동 사진 \d+$/ }).count();
      await a.getByRole("button", { name: "활동 사진 1 삭제", exact: true }).click();
      const dialog = a.getByRole("dialog", { name: "사진을 삭제할까요?" });
      await dialog.getByRole("button", { name: "삭제", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await a.getByRole("img", { name: /^활동 사진 \d+$/ }).count(), before - 1);
      await a.getByLabel("수업 내용", { exact: false }).fill("최종 관리자 확인 완료");
      await a.getByRole("button", { name: "임시저장", exact: true }).click();
      await a.getByRole("status").filter({ hasText: "저장했습니다" }).waitFor();
      await a.getByRole("button", { name: "제출", exact: true }).click();
      await a.waitForURL("**/reports");
      return { before, after: before - 1 };
    });
  }
  if (mode === "lifecycle" || mode === "teardown") {
    await step("coach cancel schedule preserves report and blocks mutations", async () => {
      await navigate(c, `/classes/${fixture.created.session}`);
      if (await c.getByRole("button", { name: "수업 취소", exact: true }).count()) {
      await c.getByRole("button", { name: "수업 취소", exact: true }).click();
      await c.getByLabel("수업 취소를 확인했습니다.").check();
      await c.getByRole("button", { name: "취소 확정", exact: true }).click();
      }
      await c.getByText("취소", { exact: true }).waitFor();
      await navigate(c, `/reports/${fixture.created.report}?edit=1`);
      assert.equal(await c.getByRole("button", { name: "제출", exact: true }).count(), 0);
      await c.getByText("최종 관리자 확인 완료", { exact: true }).waitFor();
      const response = await contexts.coach.request.delete(`${base}/api/reports/${fixture.created.report}/photos`, { headers: { origin: base }, data: { id: "10000000-0000-4000-8000-000000000001" } });
      assert.equal(response.status(), 409);
      await navigate(o, `/classes/${fixture.created.session}`);
      assert.equal(await o.getByRole("button", { name: "보고서 작성", exact: true }).count(), 0);
      await navigate(c, "/classes?view=calendar&date=2026-10-10");
      assert.match(await c.getByRole("region", { name: "선택한 날짜의 수업 목록" }).getByText("취소", { exact: true }).getAttribute("class"), /red/);
      assert.equal(await c.locator('a[aria-current="date"] .bg-red-500').count(), 1);
      return "cancelled red in calendar; report preserved; photo API 409; new report hidden";
    });
    await step("cancelled schedule preserves actual uploaded photo and denies deletion", async () => {
      if (!fixture.created.photoSession) {
        await navigate(c, `/classes/new?course=${fixture.created.course}`);
        await c.getByRole("button", { name: "다음 →" }).click();
        await c.getByLabel("수업 날짜", { exact: true }).fill("2026-10-14");
        await c.getByRole("button", { name: "다음 →" }).click();
        await c.getByRole("button", { name: "1개 수업 등록", exact: true }).click();
        await c.waitForURL(/\/classes\/[0-9a-f-]+$/);
        fixture.created.photoSession = new URL(c.url()).pathname.split("/").pop();
        await c.getByRole("button", { name: "보고서 작성", exact: true }).click();
        await c.waitForURL(/\/reports\/[0-9a-f-]+\?edit=1/);
        fixture.created.photoReport = new URL(c.url()).pathname.split("/").pop();
      }
      let rows = await required(db.from("report_attachments").select("id,storage_path").eq("report_id", fixture.created.photoReport));
      if (!rows.length) {
        await navigate(c, `/reports/${fixture.created.photoReport}?edit=1`);
        const { default: sharp } = await import("sharp");
        const buffer = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: "#bccae8" } }).jpeg().toBuffer();
        const response = c.waitForResponse(r => r.url().endsWith(`/api/reports/${fixture.created.photoReport}/photos`) && r.request().method() === "POST");
        await c.getByLabel("활동 사진 선택").setInputFiles({ name: "qa-preserved.jpg", mimeType: "image/jpeg", buffer });
        assert.equal((await response).status(), 200);
        await c.getByRole("img", { name: "활동 사진 1", exact: true }).waitFor();
        rows = await required(db.from("report_attachments").select("id,storage_path").eq("report_id", fixture.created.photoReport));
      }
      assert.equal(rows.length, 1);
      await navigate(c, `/classes/${fixture.created.photoSession}`);
      if (await c.getByRole("button", { name: "수업 취소", exact: true }).count()) {
        await c.getByRole("button", { name: "수업 취소", exact: true }).click();
        await c.getByLabel("수업 취소를 확인했습니다.").check();
        await c.getByRole("button", { name: "취소 확정", exact: true }).click();
        await c.getByText("취소", { exact: true }).waitFor();
      }
      await navigate(c, `/reports/${fixture.created.photoReport}?edit=1`);
      await c.getByRole("img", { name: "활동 사진 1", exact: true }).waitFor();
      assert.equal(await c.getByLabel("활동 사진 선택").count(), 0);
      const deletion = await contexts.coach.request.delete(`${base}/api/reports/${fixture.created.photoReport}/photos`, { headers: { origin: base }, data: { id: rows[0].id } });
      assert.equal(deletion.status(), 409);
      const after = await required(db.from("report_attachments").select("id,storage_path").eq("report_id", fixture.created.photoReport));
      assert.deepEqual(after, rows);
      assert.ok((await required(db.storage.from("report-images").download(rows[0].storage_path))).size > 0);
      return "one real uploaded JPEG remains in DB/Storage after cancellation and rejected delete";
    });
    await step("template UI soft delete preserves original report", async () => {
      await navigate(a, "/templates");
      await a.getByRole("button", { name: "삭제", exact: true }).click();
      const dialog = a.getByRole("dialog", { name: "보고서 양식을 삭제할까요?" });
      await dialog.getByRole("button", { name: "삭제", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await a.getByText(`${fixture.prefix}-양식 수정`, { exact: true }).count(), 0);
      const versions = await required(db.from("template_versions").select("status,hidden_at").eq("group_id", fixture.created.group));
      assert.ok(versions.length >= 2);
      assert.ok(versions.every(v => v.hidden_at && v.status !== "active"));
      await navigate(c, `/reports/${fixture.created.report}`);
      await c.getByText("최종 관리자 확인 완료", { exact: true }).waitFor();
      return "all group versions hidden/inactive, report still readable";
    });
  }
  if (mode === "additional") {
    await switchTo(a, "admin", fixture.organization.id);
    await switchTo(c, "coach", fixture.organization.id);
    await step("admin edits coach schedule with time; stale coach tab rejected", async () => {
      const id = fixture.created.repeatSessions[0];
      await navigate(c, `/classes/${id}/edit`);
      await c.getByRole("button", { name: "다음 →" }).click();
      await c.getByLabel("수업 날짜", { exact: true }).fill("2026-10-16");
      await c.getByRole("button", { name: "다음 →" }).click();
      await navigate(a, `/classes/${id}/edit`);
      await a.getByRole("button", { name: "다음 →" }).click();
      await a.getByLabel("수업 날짜", { exact: true }).fill("2026-10-13");
      await a.getByLabel("시간 설정 (선택)", { exact: true }).check();
      await a.getByLabel("시작 시간", { exact: true }).fill("14:00");
      await a.getByLabel("종료 시간", { exact: true }).fill("15:00");
      await a.getByRole("button", { name: "다음 →" }).click();
      await a.getByRole("button", { name: "수정 저장", exact: true }).click();
      await a.waitForURL(`**/classes/${id}`);
      const before = await required(db.from("class_sessions").select("start_at,end_at,updated_at,has_time,updated_by").eq("id", id).single());
      assert.equal(before.has_time, true);
      assert.equal(before.updated_by, fixture.users.admin.id);
      assert.equal(new Date(before.start_at).toISOString(), "2026-10-13T05:00:00.000Z");
      await c.getByRole("button", { name: "수정 저장", exact: true }).click();
      await c.getByRole("alert").filter({ hasText: "변경했습니다" }).waitFor();
      const after = await required(db.from("class_sessions").select("start_at,end_at,updated_at,has_time,updated_by").eq("id", id).single());
      assert.deepEqual(after, before);
      await navigate(o, `/courses/${fixture.created.course}/edit`);
      assert.equal(new URL(o.url()).pathname, `/courses/${fixture.created.course}`);
      assert.equal(await o.getByRole("link", { name: "수업 수정", exact: true }).count(), 0);
      return "admin time update persisted; stale coach save and other coach course edit denied";
    });
    await step("last active administrator cannot demote self", async () => {
      await navigate(a, "/members");
      const member = a.locator("main li").filter({ hasText: "QA admin" });
      await member.locator("summary").click();
      assert.equal(await member.locator('select[name="status"]').isDisabled(), true);
      await member.locator('select[name="role"]').selectOption("coach");
      await member.getByLabel("변경 확인").check();
      await member.getByRole("button", { name: "적용", exact: true }).click();
      await member.getByRole("alert").filter({ hasText: "마지막 활성 관리자" }).waitFor();
      assert.equal((await required(db.from("profiles").select("role").eq("id", fixture.users.admin.id).single())).role, "admin");
      return "self deactivation control disabled; last admin role preserved";
    });
    await step("second workspace course/schedule create with two-way isolation", async () => {
      await switchTo(a, "admin", fixture.created.workspaceB);
      if (!fixture.created.courseB) {
        await navigate(a, "/courses/new");
        await a.getByLabel("수업명", { exact: true }).fill(`${fixture.prefix}-B 미술`);
        await a.getByLabel("장소 또는 기관명").fill("QA B 미술실");
        await a.getByRole("button", { name: "수업 등록", exact: true }).click();
        await a.waitForURL(/\/courses\/[0-9a-f-]+$/);
        fixture.created.courseB = new URL(a.url()).pathname.split("/").pop();
      }
      if (!fixture.created.sessionB) {
        await navigate(a, `/classes/new?course=${fixture.created.courseB}`);
        await a.getByRole("button", { name: "다음 →" }).click();
        await a.getByLabel("수업 날짜", { exact: true }).fill("2026-10-15");
        await a.getByRole("button", { name: "다음 →" }).click();
        await a.getByRole("button", { name: "1개 수업 등록", exact: true }).click();
        await a.waitForURL(/\/classes\/[0-9a-f-]+$/);
        fixture.created.sessionB = new URL(a.url()).pathname.split("/").pop();
      }
      await navigate(a, "/classes?view=list");
      await a.locator(`a[href="/classes/${fixture.created.sessionB}"]`).waitFor();
      assert.equal(await a.locator(`a[href="/classes/${fixture.created.session}"]`).count(), 0);
      await switchTo(a, "admin", fixture.organization.id);
      await navigate(a, "/classes?view=list");
      assert.equal(await a.locator(`a[href="/classes/${fixture.created.sessionB}"]`).count(), 0);
      await a.locator(`a[href="/classes/${fixture.created.session}"]`).waitFor();
      return "A and B non-empty schedules remain separate in both directions";
    });
  }
  if (mode === "onboarding") {
    await switchTo(a, "admin", fixture.organization.id);
    await step("pending invitation registered; password setup activates membership", async () => {
      const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      await required(adminClient.auth.signInWithPassword({ email: fixture.users.admin.email, password: fixture.users.admin.password }));
      if (!fixture.users.pending) {
        const email = `${fixture.prefix.toLowerCase()}-pending@example.com`;
        const password = randomBytes(24).toString("base64url");
        const data = await required(db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { qa_fixture: true, must_change_password: true } }));
        fixture.users.pending = { id: data.user.id, email, password };
        await writeFile(fixtureFile, JSON.stringify(fixture));
        await required(adminClient.rpc("register_workspace_invitee", { p_user_id: data.user.id, p_name: "QA pending" }));
      }
      const bypass = await adminClient.rpc("change_member_status", { p_user_id: fixture.users.pending.id, p_status: "active" });
      assert.equal(bypass.error?.code, "42501");
      const pending = await required(db.from("profiles").select("status").eq("id", fixture.users.pending.id).single());
      assert.equal(pending.status, "pending");
      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();
      await page.goto(`${base}/login`);
      await page.locator('[name="email"]').fill(fixture.users.pending.email);
      await page.locator('[name="password"]').fill(fixture.users.pending.password);
      await page.getByRole("button", { name: "로그인", exact: true }).click();
      await page.waitForURL("**/set-password");
      await page.goto(`${base}/dashboard`);
      await page.waitForURL("**/set-password");
      const password = randomBytes(24).toString("base64url");
      await page.locator('[name="password"]').fill(password);
      await page.locator('[name="passwordConfirm"]').fill("wrong-confirmation");
      await page.getByRole("button", { name: "가입 완료하고 시작하기", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "일치하지 않습니다" }).waitFor();
      await page.locator('[name="password"]').fill(password);
      await page.locator('[name="passwordConfirm"]').fill(password);
      await page.getByRole("button", { name: "가입 완료하고 시작하기", exact: true }).click();
      await page.waitForURL("**/dashboard");
      fixture.users.pending.password = password;
      const active = await required(db.from("workspace_memberships").select("status").eq("user_id", fixture.users.pending.id).single());
      assert.equal(active.status, "active");
      const user = await required(db.auth.admin.getUserById(fixture.users.pending.id));
      assert.equal(user.user.user_metadata.must_change_password, false);
      await page.getByRole("button", { name: "로그아웃", exact: true }).click();
      await page.waitForURL("**/login");
      await page.goto(`${base}/dashboard`);
      await page.waitForURL("**/login");
      await context.close();
      return "QA auth fixture (no external mail): pending gate, confirmation error, activation and logout passed";
    });
  }
  if (mode === "schedule-retest") {
    await switchTo(c, "coach", fixture.organization.id);
    await step("coach schedule create/read/update", async () => {
      if (!fixture.created.retestSession) {
        await navigate(c, `/classes/new?course=${fixture.created.course}`);
        await c.getByRole("button", { name: "다음 →" }).click();
        await c.getByLabel("수업 날짜", { exact: true }).fill("2026-10-17");
        await c.getByRole("button", { name: "다음 →" }).click();
        await c.getByRole("button", { name: "1개 수업 등록", exact: true }).click();
        await c.waitForURL(/\/classes\/[0-9a-f-]+$/);
        fixture.created.retestSession = new URL(c.url()).pathname.split("/").pop();
      }
      const id = fixture.created.retestSession;
      await navigate(c, `/classes/${id}`);
      await c.getByRole("link", { name: "수업 수정", exact: true }).click();
      await c.getByRole("button", { name: "다음 →" }).click();
      await c.getByLabel("수업 날짜", { exact: true }).fill("2026-10-18");
      await c.getByRole("button", { name: "다음 →" }).click();
      await c.getByRole("button", { name: "수정 저장", exact: true }).click();
      await c.waitForURL(`**/classes/${id}`);
      await c.getByText("2026년 10월 18일 일 · 시간 미정", { exact: true }).waitFor();
      const saved = await required(db.from("class_sessions").select("start_at,created_by,status").eq("id", id).single());
      assert.equal(new Date(new Date(saved.start_at).getTime() + 9 * 3600000).toISOString().slice(0, 10), "2026-10-18");
      assert.equal(saved.created_by, fixture.users.coach.id);
      assert.equal(saved.status, "scheduled");
      return "fresh coach schedule created, read, edited and persisted (Seoul date verified)";
    });
  }
  if (mode === "mobile-image") {
    await step("mobile retained photo decodes after cancellation", async () => {
      await navigate(c, `/reports/${fixture.created.photoReport}?edit=1`);
      const image = c.getByRole("img", { name: "활동 사진 1", exact: true });
      await image.waitFor();
      await c.waitForFunction(() => {
        const img = document.querySelector('img[alt="활동 사진 1"]');
        return img?.complete && img.naturalWidth > 0;
      });
      const decoded = await image.evaluate(img => ({ width: img.naturalWidth, height: img.naturalHeight }));
      assert.deepEqual(decoded, { width: 1280, height: 960 });
      assert.equal(await c.getByLabel("활동 사진 선택").count(), 0);
      await c.screenshot({ path: path.join(artifactDir, `mobile-decoded-${deviceName?.replaceAll(" ", "-") ?? "desktop"}.png`), fullPage: true });
      return { decoded, profile: deviceName, editable: false };
    });
  }
  if (mode === "smoke") {
    await step(deviceName ? `final authenticated mobile smoke (${deviceName})` : "final authenticated desktop/mobile smoke", async () => {
      const errors = [];
      let pageLoads = 0;
      for (const [role, page] of Object.entries(pages)) {
        page.on("pageerror", e => errors.push({ role, error: e.message }));
        const routes = role === "admin" ? ["/dashboard", "/courses", "/classes", "/admin-reports", "/members", "/templates", "/exports", "/workspaces"] : ["/dashboard", "/courses", "/classes", "/reports", `/reports/${fixture.created.report}`];
        const viewports = deviceName ? deviceName.includes("Pro Max") ? [{ width: 440, height: 763 }, { width: 838, height: 390 }] : [{ width: 402, height: 681 }, { width: 756, height: 352 }] : [{ width: 1280, height: 900 }, { width: 390, height: 900 }];
        for (const viewport of viewports) {
          await page.setViewportSize(viewport);
          for (const route of routes) {
            if (role === "other" && route.startsWith("/reports/")) continue;
            await navigate(page, route);
            pageLoads++;
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${role}:${JSON.stringify(viewport)}:${route}`);
            if (deviceName && role === "admin" && route === "/dashboard") await page.screenshot({ path: path.join(artifactDir, `mobile-${deviceName.replaceAll(" ", "-")}-${viewport.width}.png`), fullPage: true });
          }
        }
      }
      assert.deepEqual(errors, []);
      return { pageLoads, engine, profile: deviceName ?? "Desktop Chrome", errors, horizontalOverflow: false, screenProfile: contextOptions.screen, deviceScaleFactor: contextOptions.deviceScaleFactor ?? 1 };
    });
  }
} finally {
  await writeFile(fixtureFile, JSON.stringify(fixture));
  await browser.close();
}
