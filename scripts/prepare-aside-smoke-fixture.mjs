import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const adminId = "f8601730-c133-41b8-8d69-316edc982195";
const expectedSessionId = "86d7097a-5dd1-424a-a530-3b4a82a2b8fb";
const expectedHost = "vhlrmudatjcgspwltdix.supabase.co";
const sessionId = process.argv[process.argv.indexOf("--session-id") + 1];

if (!url || !key || !publishableKey || new URL(url).hostname !== expectedHost) {
  throw new Error("QA 전용 Supabase 개발 프로젝트 설정이 필요합니다.");
}
if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(sessionId || "")) {
  throw new Error("사용법: node --env-file=.env.local scripts/prepare-aside-smoke-fixture.mjs --session-id <개발용 수업 UUID> [--apply]");
}
if (sessionId !== expectedSessionId) {
  throw new Error("확인한 개발용 2026-09-23 테스트 수업 UUID만 허용합니다.");
}

const db = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const one = async (query, label) => {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  if (!data) throw new Error(`${label}: 데이터 없음`);
  return data;
};

const admin = await one(
  db.from("profiles").select("id,organization_id,role,status").eq("id", adminId).single(),
  "테스트 관리자",
);
if (admin.role !== "admin" || admin.status !== "active") {
  throw new Error("예상한 활성 테스트 관리자 계정이 아닙니다.");
}
if (!apply) {
  console.log(JSON.stringify({ mode: "dry-run", project: expectedHost, adminReady: true,
    sessionId, planned: "QA 코치 1명과 해당 개발용 수업의 임시저장 보고서 1건" }));
} else {
  const suffix = `${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomBytes(3).toString("hex")}`;
  const email = `flag-edu-qa-smoke-${suffix}@example.com`;
  const password = randomBytes(32).toString("base64url");
  const created = { sessionId, userId: null, reportId: null };

  try {
  const { data: auth, error: authError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { qa_fixture: true },
  });
  if (authError || !auth.user?.id) throw new Error(`QA 계정 생성: ${authError?.message ?? "ID 없음"}`);
  created.userId = auth.user.id;

  await one(
    db.from("profiles").insert({ id: auth.user.id, organization_id: admin.organization_id,
      name: "QA 코치", role: "coach", status: "active" }).select("id").single(),
    "QA 프로필",
  );

  const coach = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: loginError } = await coach.auth.signInWithPassword({ email, password });
  if (loginError) throw new Error(`QA 코치 로그인: ${loginError.message}`);
  const report = await one(
    coach.rpc("get_or_create_report", { p_class_session_id: sessionId }),
    "QA 보고서 생성",
  );
  if (report.author_id !== auth.user.id || report.class_session_id !== sessionId) {
    throw new Error("생성된 보고서 소유자가 QA 코치와 일치하지 않습니다.");
  }
  created.reportId = report.id;
  console.log(JSON.stringify({ mode: "applied", ...created, date: "2026-09-23",
    note: "QA 전용 데이터이며 자동 삭제하지 않습니다." }));
  } catch (error) {
    console.error(JSON.stringify({ mode: "partial-failure", ...created, error: error.message }));
    process.exitCode = 1;
  }
}
