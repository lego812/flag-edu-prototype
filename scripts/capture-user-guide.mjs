// Documentation-only captures: use an external, mode-0600 session fixture.
// This never signs in as a real user, submits forms, or persists business data.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const { chromium } = await import(process.env.GUIDE_PLAYWRIGHT_MODULE);
const fixture = JSON.parse(
  await readFile(process.env.GUIDE_SESSION_FILE, "utf8"),
);
for (const role of ["admin", "coach", "unaffiliated"]) {
  assert.equal(fixture[role].session.user.user_metadata?.qa_fixture, true);
  assert.equal(fixture[role].session.user.id, fixture[role].profile.id);
}
assert.equal(fixture.admin.profile.organization_id, fixture.workspace.id);
assert.equal(fixture.coach.profile.organization_id, fixture.workspace.id);
const base = "https://flag-edu-prototype.vercel.app";
const sourceCommit = process.env.GUIDE_SOURCE_COMMIT;
assert.match(sourceCommit ?? "", /^[a-f0-9]{40}$/);
const output = path.resolve("docs/images");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.GUIDE_CHROMIUM || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const adminOnly = process.env.GUIDE_ROLE === "admin";
const previous = adminOnly
  ? JSON.parse(await readFile(path.join(output, "guide-manifest.json"), "utf8"))
  : null;
if (previous) assert.equal(previous.sourceCommit, sourceCommit);
const images = previous
    ? previous.images.filter((image) => image.role !== "admin")
    : [],
  errors = [],
  blockedWrites = [];
const identities = ["admin", "coach", "unaffiliated"].flatMap((role) => [
  [
    fixture[role].profile.name,
    role === "admin"
      ? "예시 관리자"
      : role === "coach"
        ? "예시 코치"
        : "새 회원",
  ],
  [fixture[role].session.user.email, role + "@example.com"],
]);
identities.push([fixture.workspace.name, "플래그 교육"]);
async function context(role) {
  const c = await browser.newContext({
    viewport: { width: 402, height: 874 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    serviceWorkers: "block",
  });
  // Keep TLS verification and the managed proxy's CA in Node. Return the
  // unchanged production response to Chromium, whose CA store is separate.
  await c.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    const allowed = [
      "flag-edu-prototype.vercel.app",
      "vhlrmudatjcgspwltdix.supabase.co",
      "fonts.googleapis.com",
      "fonts.gstatic.com",
    ];
    assert.ok(allowed.includes(url.hostname));
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method()) &&
      !(
        req.method() === "POST" &&
        url.pathname === "/rest/v1/rpc/list_my_workspace_invitations"
      )
    ) {
      blockedWrites.push({
        method: req.method(),
        path: url.pathname.replace(/[0-9a-f-]{36}/g, ":id"),
      });
      return route.abort();
    }
    try {
      const response = await fetch(req.url(), {
        method: req.method(),
        headers: req.headers(),
        body: req.postDataBuffer() ?? undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(45000),
      });
      const headers = Object.fromEntries(response.headers);
      delete headers["content-encoding"];
      delete headers["content-length"];
      await route.fulfill({
        status: response.status,
        headers,
        body: Buffer.from(await response.arrayBuffer()),
      });
    } catch (error) {
      if (!/closed|disposed/i.test(String(error)))
        errors.push({
          type: "transport",
          path: url.pathname.replace(/[0-9a-f-]{36}/g, ":id"),
        });
      await route.abort().catch(() => {});
    }
  });
  if (role) {
    const value =
      "base64-" +
      Buffer.from(JSON.stringify(fixture[role].session)).toString("base64url");
    const cookies = [];
    for (let j = 0, i = 0; j < value.length; j += 3180, i++)
      cookies.push({
        name:
          "sb-vhlrmudatjcgspwltdix-auth-token" +
          (value.length > 3180 ? "." + i : ""),
        value: value.slice(j, j + 3180),
        url: base,
      });
    await c.addCookies(cookies);
  }
  const p = await c.newPage();
  p.on("pageerror", () =>
    errors.push({ type: "pageerror", role: role ?? "anonymous" }),
  );
  return { c, p };
}
async function visit(p, route) {
  const response = await p.goto(base + route, {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  assert.equal(response.status(), 200);
  assert.equal(new URL(p.url()).pathname, route.split("?")[0]);
  await p.locator("h1").waitFor();
  await p.evaluate(() => document.fonts.ready);
}
async function capture(p, file, role, focus) {
  if (focus)
    await focus.evaluate((node) => node.scrollIntoView({ block: "start" }));
  else await p.evaluate(() => scrollTo(0, 0));
  await p.waitForLoadState("networkidle");
  await p.evaluate((pairs) => {
    const redact = (text) => {
      for (const [a, b] of pairs) text = text.split(a).join(b);
      return text
        .replace(/QA-WS-CRUD-\d+/g, "교육 예시")
        .replace(/qa[^\s<>@]*@[^\s<>]+/gi, "member@example.com")
        .replace(/QA 수정 체육관/g, "예시 체육관");
    };
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (["SCRIPT", "STYLE"].includes(n.parentElement?.tagName)) continue;
      const value = redact(n.textContent);
      if (value !== n.textContent) n.textContent = value;
    }
    for (const node of document.querySelectorAll(
      "input:not([type=hidden]), textarea",
    )) {
      const value = redact(node.value);
      if (value !== node.value) node.value = value;
    }
  }, identities);
  for (const img of await p.locator("img").all())
    await img.evaluate((node) => node.decode());
  const visible = await p.locator("body").innerText();
  assert.ok(
    !/QA-WS-CRUD-\d+|[0-9a-f]{8}-[0-9a-f-]{27,}|eyJ[A-Za-z0-9_-]{40,}/.test(
      visible,
    ),
  );
  for (const roleName of ["admin", "coach", "unaffiliated"])
    assert.ok(!visible.includes(fixture[roleName].session.user.email));
  assert.equal(
    await p.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
  );
  const bytes = await p.screenshot({
    path: path.join(output, file),
    type: "jpeg",
    quality: 88,
    fullPage: false,
    animations: "disabled",
    scale: "device",
  });
  images.push({
    file,
    role,
    route: new URL(p.url()).pathname.replace(/[0-9a-f-]{36}/g, ":id"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  console.log(JSON.stringify({ captured: file }));
}
try {
  if (!adminOnly) {
    const { c, p } = await context();
    await visit(p, "/login");
    await capture(p, "common-login.jpg", "common");
    await c.close();
  }
  if (!adminOnly) {
    const { c, p } = await context("unaffiliated");
    await visit(p, "/welcome");
    await capture(p, "common-welcome.jpg", "common");
    await visit(p, "/manage/account");
    await capture(p, "common-no-workspace.jpg", "common");
    await c.close();
  }
  if (!adminOnly) {
    const { c, p } = await context("coach");
    const course = fixture.courses[0].id,
      report = fixture.reports[0].id;
    for (const [route, file] of [
      ["/dashboard", "common-dashboard.jpg"],
      ["/manage/account", "common-account.jpg"],
      ["/workspaces", "common-workspaces.jpg"],
      ["/courses", "common-courses.jpg"],
      ["/courses/new", "common-course-registration.jpg"],
      ["/classes?view=list", "common-schedule-list.jpg"],
      [
        "/classes?view=calendar&month=2026-10&date=2026-10-10",
        "common-calendar.jpg",
      ],
      ["/reports", "coach-report-list.jpg"],
      ["/reports/" + report, "coach-report-view.jpg"],
    ]) {
      await visit(p, route);
      await capture(p, file, "coach");
    }
    if (fixture.photoReportId)
      await visit(p, "/reports/" + fixture.photoReportId);
    if (await p.locator("img").count())
      await capture(
        p,
        "coach-report-photos.jpg",
        "coach",
        p.locator("img").first(),
      );
    await visit(p, "/classes?view=list");
    await p.getByRole("button", { name: "필터", exact: true }).click();
    await capture(
      p,
      "common-schedule-filters.jpg",
      "coach",
      p.locator('select[name="status"]'),
    );
    await visit(p, "/classes/new?course=" + course);
    await capture(p, "common-class-registration.jpg", "coach");
    await p.getByRole("button", { name: "다음 →", exact: true }).click();
    await capture(p, "coach-schedule-repeat.jpg", "coach");
    await visit(p, "/dashboard");
    await p.getByRole("button", { name: /워크스페이스 변경:/ }).click();
    await p.getByText("받은 초대가 없습니다.", { exact: true }).waitFor();
    await capture(p, "common-workspace-switch.jpg", "coach");
    await p.keyboard.press("Escape");
    await visit(p, "/workspaces/" + fixture.workspace.id);
    await capture(p, "coach-participants.jpg", "coach");
    await visit(p, "/manage/account");
    await p.getByRole("button", { name: "로그아웃", exact: true }).click();
    await capture(p, "common-logout.jpg", "coach");
    await p.keyboard.press("Escape");
    await c.close();
  }
  {
    const { c, p } = await context("admin");
    for (const [route, file] of [
      ["/manage", "admin-manage.jpg"],
      ["/admin-reports", "admin-reports.jpg"],
      ["/templates", "admin-templates.jpg"],
      ["/exports", "admin-exports.jpg"],
    ]) {
      await visit(p, route);
      await capture(p, file, "admin");
    }
    await visit(p, "/templates/new");
    await p.getByRole("button", { name: "항목 추가", exact: true }).click();
    await p.getByLabel("항목명", { exact: true }).fill("오늘의 수업 활동");
    await p.getByRole("combobox").first().selectOption("long_text");
    await capture(p, "admin-template-editor.jpg", "admin");
    await visit(p, "/workspaces/" + fixture.workspace.id);
    await p.getByText("워크스페이스 이름 변경", { exact: true }).click();
    await capture(p, "admin-workspace-rename.jpg", "admin");
    await p.getByText("워크스페이스 이름 변경", { exact: true }).click();
    await p
      .locator("summary")
      .filter({ hasText: "권한·상태 변경" })
      .last()
      .click();
    await capture(p, "admin-members.jpg", "admin", p.locator("details[open]"));
    await capture(
      p,
      "admin-invitations.jpg",
      "admin",
      p.getByRole("heading", { name: "워크스페이스 초대", exact: true }),
    );
    await p
      .getByRole("button", { name: "참여자 권한 안내", exact: true })
      .click();
    await capture(p, "admin-role-help.jpg", "admin");
    await p.keyboard.press("Escape");
    await p
      .getByRole("button", { name: "워크스페이스 삭제", exact: true })
      .click();
    await capture(p, "admin-workspace-delete.jpg", "admin");
    await p.keyboard.press("Escape");
    await c.close();
  }
  assert.equal(blockedWrites.length, 0);
  assert.equal(errors.length, 0);
  await writeFile(
    path.join(output, "guide-manifest.json"),
    JSON.stringify(
      {
        sourceCommit,
        capturedAt: new Date().toISOString(),
        base,
        engine: "Chromium",
        transport:
          "Verified TLS through managed proxy; unchanged production responses",
        viewport: { width: 402, height: 874 },
        deviceScaleFactor: 3,
        physicalPixels: { width: 1206, height: 2622 },
        realDevice: false,
        captureValidation: {
          businessWrites: 0,
          browserErrors: errors.length,
          images: images.length,
        },
        privacy:
          "Only tagged QA accounts. Example identities redacted in disposable DOM; no raw logs, credentials, browser chrome or signed URLs.",
        images,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
  if (errors.length || blockedWrites.length)
    console.log(JSON.stringify({ errors, blockedWrites }));
}
