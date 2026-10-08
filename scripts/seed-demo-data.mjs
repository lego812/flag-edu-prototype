import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

const CONFIRMATION = "REPLACE-DEMO-DATA";
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const BUSINESS_TABLES = [
  "export_jobs",
  "report_attachments",
  "report_answers",
  "reports",
  "field_options",
  "template_fields",
  "template_versions",
  "class_sessions",
  "courses",
];

function parseArgs(argv) {
  return Object.fromEntries(
    argv
      .filter((value) => value.startsWith("--"))
      .map((value) => {
        const [key, ...rest] = value.slice(2).split("=");
        return [key, rest.length ? rest.join("=") : true];
      }),
  );
}

function assertValue(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function chunk(values, size) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  );
}

function seoulDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function dateAtOffset(offset) {
  const { year, month, day } = seoulDateParts();
  const value = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + offset));
  return value.toISOString().slice(0, 10);
}

function atKst(offset, time) {
  return new Date(`${dateAtOffset(offset)}T${time}:00+09:00`).toISOString();
}

function afterHours(iso, hours) {
  return new Date(new Date(iso).getTime() + hours * 60 * 60 * 1000).toISOString();
}

async function required(result, label) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message || result.error.code || "unknown error"}`);
  }
  return result;
}

async function findUsers(client, adminEmail, coachEmail) {
  const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`Auth 사용자 조회: ${error.message}`);
  const byEmail = new Map(
    data.users.map((user) => [(user.email ?? "").toLowerCase(), user]),
  );
  const admin = assertValue(byEmail.get(adminEmail), `관리자 계정을 찾을 수 없습니다: ${adminEmail}`);
  const coach = assertValue(byEmail.get(coachEmail), `코치 계정을 찾을 수 없습니다: ${coachEmail}`);
  const { data: profiles, error: profileError } = await client
    .from("profiles")
    .select("id,organization_id,name,role,status")
    .in("id", [admin.id, coach.id]);
  if (profileError) throw new Error(`프로필 조회: ${profileError.message}`);
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const adminProfile = assertValue(byId.get(admin.id), "관리자 프로필이 없습니다.");
  const coachProfile = assertValue(byId.get(coach.id), "코치 프로필이 없습니다.");
  if (adminProfile.organization_id !== coachProfile.organization_id) {
    throw new Error("두 계정이 같은 기관에 속해 있지 않습니다. 데이터 정리를 중단합니다.");
  }
  return { admin, coach, adminProfile, coachProfile };
}

async function tableCounts(client) {
  const counts = {};
  for (const table of BUSINESS_TABLES) {
    const result = await client.from(table).select("id", { count: "exact", head: true });
    await required(result, `${table} 건수 조회`);
    counts[table] = result.count ?? 0;
  }
  return counts;
}

async function listBucketFiles(client, bucket) {
  const files = [];
  async function visit(prefix = "") {
    for (let offset = 0; ; offset += 100) {
      const result = await client.storage.from(bucket).list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      await required(result, `${bucket} 목록 조회`);
      const entries = result.data ?? [];
      for (const entry of entries) {
        const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.id) files.push(objectPath);
        else await visit(objectPath);
      }
      if (entries.length < 100) break;
    }
  }
  await visit();
  return files;
}

async function clearBucket(client, bucket) {
  const files = await listBucketFiles(client, bucket);
  for (const paths of chunk(files, 100)) {
    await required(await client.storage.from(bucket).remove(paths), `${bucket} 파일 삭제`);
  }
  return files.length;
}

async function clearBusinessData(client) {
  const removedStorage = {
    "report-images": await clearBucket(client, "report-images"),
    "report-exports": await clearBucket(client, "report-exports"),
  };

  await required(
    await client
      .from("template_versions")
      .update({ status: "draft", published_at: null })
      .neq("id", ZERO_UUID),
    "게시 양식 정리 준비",
  );

  const removedRows = {};
  for (const table of BUSINESS_TABLES) {
    const result = await client
      .from(table)
      .delete({ count: "exact" })
      .neq("id", ZERO_UUID);
    await required(result, `${table} 삭제`);
    removedRows[table] = result.count ?? 0;
  }
  return { removedRows, removedStorage };
}

function buildClasses({ organizationId, adminId, coachId }) {
  const foundationRegistration = randomUUID();
  const outreachRegistration = randomUUID();
  const createdAt = atKst(-35, "10:00");
  const courseIds = {
    foundation: randomUUID(),
    outreach: randomUUID(),
    family: randomUUID(),
    advanced: randomUUID(),
    workshop: randomUUID(),
  };
  const courses = [
    {
      id: courseIds.foundation,
      organization_id: organizationId,
      title: "플래그풋볼 기초반 A",
      location: "한신대학교 대운동장",
      teaching_method: "대면 수업 · 실습 중심",
      memo: "출석 확인 후 준비운동, 패스 기본기, 4대4 미니 게임 순서로 진행합니다.",
      active: true,
      created_by: coachId,
      updated_by: coachId,
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: courseIds.outreach,
      organization_id: organizationId,
      title: "꿈나무 찾아가는 스포츠교실",
      location: "화성 꿈나무지역아동센터",
      teaching_method: "방문형 그룹 수업",
      memo: "저학년과 고학년을 두 모둠으로 나누고 난이도를 조절합니다.",
      active: true,
      created_by: coachId,
      updated_by: coachId,
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: courseIds.family,
      organization_id: organizationId,
      title: "주말 가족 플래그풋볼 체험",
      location: "수원 종합운동장 보조경기장",
      teaching_method: "체험형 공개 수업",
      memo: "보호자와 학생이 함께 참여합니다. 현장 접수 5가족을 추가로 받을 수 있습니다.",
      active: true,
      created_by: adminId,
      updated_by: adminId,
      created_at: atKst(-10, "09:30"),
      updated_at: atKst(-10, "09:30"),
    },
    {
      id: courseIds.advanced,
      organization_id: organizationId,
      title: "토요 심화반 경기 운영",
      location: "한신대학교 대운동장",
      teaching_method: "대면 수업",
      memo: "경기 규칙과 포지션별 움직임을 익히는 심화 과정입니다.",
      active: false,
      created_by: coachId,
      updated_by: coachId,
      created_at: atKst(-20, "11:00"),
      updated_at: atKst(-3, "08:10"),
    },
    {
      id: courseIds.workshop,
      organization_id: organizationId,
      title: "코치 역량강화 워크숍",
      location: "한신대학교 체육관 세미나실",
      teaching_method: "오프라인 워크숍",
      memo: "세부 시간은 참석자 일정 취합 후 공지합니다.",
      active: true,
      created_by: adminId,
      updated_by: adminId,
      created_at: atKst(-6, "14:00"),
      updated_at: atKst(-6, "14:00"),
    },
  ];
  const sessions = [];

  for (const [occurrence, offset] of [-28, -21, -14, -7, 0, 7, 14, 21].entries()) {
    sessions.push({
      id: randomUUID(),
      organization_id: organizationId,
      course_id: courseIds.foundation,
      title: "플래그풋볼 기초반 A",
      location: "한신대학교 대운동장",
      start_at: atKst(offset, "16:00"),
      end_at: atKst(offset, "17:30"),
      memo: "출석 확인 후 준비운동, 패스 기본기, 4대4 미니 게임 순서로 진행합니다.",
      teaching_method: "대면 수업 · 실습 중심",
      has_time: true,
      status: "scheduled",
      created_by: coachId,
      updated_by: coachId,
      registration_id: foundationRegistration,
      occurrence_no: occurrence,
      created_at: createdAt,
      updated_at: createdAt,
      scenario: "foundation",
      offset,
    });
  }

  for (const [occurrence, offset] of [-19, -12, -5, 2, 9].entries()) {
    sessions.push({
      id: randomUUID(),
      organization_id: organizationId,
      course_id: courseIds.outreach,
      title: "꿈나무 찾아가는 스포츠교실",
      location: "화성 꿈나무지역아동센터",
      start_at: atKst(offset, "15:30"),
      end_at: atKst(offset, "17:00"),
      memo: "저학년과 고학년을 두 모둠으로 나누고 난이도를 조절합니다.",
      teaching_method: "방문형 그룹 수업",
      has_time: true,
      status: "scheduled",
      created_by: coachId,
      updated_by: coachId,
      registration_id: outreachRegistration,
      occurrence_no: occurrence,
      created_at: createdAt,
      updated_at: createdAt,
      scenario: "outreach",
      offset,
    });
  }

  sessions.push(
    {
      id: randomUUID(),
      organization_id: organizationId,
      course_id: courseIds.family,
      title: "주말 가족 플래그풋볼 체험",
      location: "수원 종합운동장 보조경기장",
      start_at: atKst(4, "10:00"),
      end_at: atKst(4, "12:00"),
      memo: "보호자와 학생이 함께 참여합니다. 현장 접수 5가족을 추가로 받을 수 있습니다.",
      teaching_method: "체험형 공개 수업",
      has_time: true,
      status: "scheduled",
      created_by: adminId,
      updated_by: adminId,
      registration_id: null,
      occurrence_no: null,
      created_at: atKst(-10, "09:30"),
      updated_at: atKst(-10, "09:30"),
      scenario: "family",
      offset: 4,
    },
    {
      id: randomUUID(),
      organization_id: organizationId,
      course_id: courseIds.advanced,
      title: "토요 심화반 경기 운영",
      location: "한신대학교 대운동장",
      start_at: atKst(-3, "10:00"),
      end_at: atKst(-3, "12:00"),
      memo: "우천과 운동장 상태 악화로 수업을 취소했습니다.",
      teaching_method: "대면 수업",
      has_time: true,
      status: "cancelled",
      created_by: coachId,
      updated_by: coachId,
      registration_id: null,
      occurrence_no: null,
      created_at: atKst(-20, "11:00"),
      updated_at: atKst(-3, "08:10"),
      scenario: "cancelled",
      offset: -3,
    },
    {
      id: randomUUID(),
      organization_id: organizationId,
      course_id: courseIds.workshop,
      title: "코치 역량강화 워크숍",
      location: "한신대학교 체육관 세미나실",
      start_at: atKst(10, "00:00"),
      end_at: atKst(11, "00:00"),
      memo: "세부 시간은 참석자 일정 취합 후 공지합니다.",
      teaching_method: "오프라인 워크숍",
      has_time: false,
      status: "scheduled",
      created_by: adminId,
      updated_by: adminId,
      registration_id: null,
      occurrence_no: null,
      created_at: atKst(-6, "14:00"),
      updated_at: atKst(-6, "14:00"),
      scenario: "workshop",
      offset: 10,
    },
  );

  return { courses, sessions };
}

function buildReportContent(session, index) {
  const foundation = session.scenario === "foundation";
  const moods = ["활발함", "안정적", "활발함", "집중 필요"];
  const participants = foundation ? [12, 14, 13, 15, 14] : [9, 11, 10];
  const notes = foundation
    ? [
        "첫 수업이라 플래그 벨트 착용법과 안전 규칙을 충분히 안내했다. 짝 패스에서는 공을 받을 때 시선을 유지하는 연습을 반복했고, 마지막 미니 게임에서 참여도가 높았다.",
        "지난 시간보다 패스 정확도가 좋아졌다. 이동하며 받기에서 어려움을 보인 학생 두 명은 거리를 줄여 성공 경험을 만들었다. 팀별 작전 시간을 주니 의사소통이 자연스럽게 늘었다.",
        "플래그 뺏기 수비 자세를 집중적으로 연습했다. 경기 중 충돌이 없도록 이동 동선을 먼저 시범 보였고, 학생들이 스스로 규칙을 설명할 수 있을 정도로 이해도가 높아졌다.",
        "4대4 경기 비중을 늘렸다. 초반에는 공을 가진 학생에게 몰렸지만 구역을 나눠 움직이도록 안내한 뒤 공간 활용이 좋아졌다. 정리 운동과 다음 차시 목표 공유까지 완료했다.",
      ]
    : [
        "센터 공간에 맞춰 짧은 패스와 방향 전환 놀이로 시작했다. 저학년은 공 잡기, 고학년은 이동 패스를 중심으로 운영해 모두가 반복해서 참여할 수 있었다.",
        "두 모둠을 순환하며 플래그 뺏기와 패스 릴레이를 진행했다. 기다리는 시간이 길어지지 않도록 코스를 두 개로 나눈 것이 효과적이었다.",
        "미니 게임에서 고학년 학생들이 저학년에게 규칙을 설명하도록 역할을 주었다. 협력 분위기가 좋았고, 마지막에는 각자 잘된 점을 한 가지씩 발표했다.",
      ];
  return {
    participant: participants[index] ?? 12,
    mood: moods[index % moods.length],
    activities: foundation
      ? ["준비운동", "패스 연습", "플래그 뺏기", "미니 게임", "정리 운동"]
      : ["준비운동", "패스 연습", "플래그 뺏기", "정리 운동"],
    note: notes[index] ?? notes[notes.length - 1],
    next: foundation
      ? "이동 패스와 공격 위치 선정 연습 후 5대5 경기로 연결한다."
      : "모둠별 패스 릴레이 시간을 줄이고 간단한 작전 만들기를 추가한다.",
  };
}

async function seedScenario(client, users) {
  const organizationId = users.adminProfile.organization_id;
  const now = new Date().toISOString();
  const templateId = randomUUID();
  await required(
    await client.from("template_versions").insert({
      id: templateId,
      organization_id: organizationId,
      name: "수업 운영 보고서",
      version: 1,
      status: "draft",
      created_by: users.admin.id,
      created_at: atKst(-40, "09:00"),
      updated_at: atKst(-40, "09:00"),
    }),
    "보고서 양식 생성",
  );

  const fields = [
    { key: "participant", label: "참여 인원", help_text: "실제 참여 인원을 선택하세요", field_type: "number", required: true, settings: {} },
    { key: "mood", label: "수업 분위기", help_text: "전체적인 분위기를 선택하세요", field_type: "single_select", required: true, settings: {} },
    { key: "activities", label: "진행 활동", help_text: null, field_type: "multi_select", required: true, settings: {} },
    { key: "note", label: "수업 내용 및 코치 의견", help_text: "활동 내용, 참여도, 특이사항을 기록하세요", field_type: "long_text", required: true, settings: {} },
    { key: "next", label: "다음 수업 계획", help_text: "다음 시간에 이어갈 내용을 입력하세요", field_type: "short_text", required: false, settings: {} },
    { key: "photo", label: "활동 사진", help_text: null, field_type: "photo", required: false, settings: { max_files: 5 } },
  ].map((field, sortOrder) => ({ ...field, id: randomUUID(), template_version_id: templateId, sort_order: sortOrder }));
  const fieldByKey = new Map(fields.map((field) => [field.key, field]));
  const fieldRows = fields.map((field) => ({
    id: field.id,
    template_version_id: field.template_version_id,
    label: field.label,
    help_text: field.help_text,
    field_type: field.field_type,
    required: field.required,
    settings: field.settings,
    sort_order: field.sort_order,
  }));
  await required(await client.from("template_fields").insert(fieldRows), "보고서 항목 생성");

  const options = [
    ...["활발함", "안정적", "집중 필요"].map((label, sort_order) => ({
      id: randomUUID(), field_id: fieldByKey.get("mood").id, label, sort_order,
    })),
    ...["준비운동", "패스 연습", "플래그 뺏기", "미니 게임", "정리 운동"].map((label, sort_order) => ({
      id: randomUUID(), field_id: fieldByKey.get("activities").id, label, sort_order,
    })),
  ];
  await required(await client.from("field_options").insert(options), "선택지 생성");
  await required(
    await client
      .from("template_versions")
      .update({ status: "active", published_at: atKst(-39, "11:00") })
      .eq("id", templateId),
    "보고서 양식 게시",
  );

  const { courses, sessions } = buildClasses({
    organizationId,
    adminId: users.admin.id,
    coachId: users.coach.id,
  });
  await required(await client.from("courses").insert(courses), "수업 기본정보 생성");
  const sessionRows = sessions.map((session) => ({
    id: session.id,
    organization_id: session.organization_id,
    course_id: session.course_id,
    title: session.title,
    location: session.location,
    start_at: session.start_at,
    end_at: session.end_at,
    memo: session.memo,
    teaching_method: session.teaching_method,
    has_time: session.has_time,
    status: session.status,
    created_by: session.created_by,
    updated_by: session.updated_by,
    registration_id: session.registration_id,
    occurrence_no: session.occurrence_no,
    created_at: session.created_at,
    updated_at: session.updated_at,
  }));
  await required(await client.from("class_sessions").insert(sessionRows), "수업 일정 생성");

  const reportSessions = [
    ...sessions.filter((session) => session.scenario === "foundation" && session.offset <= 0).slice(0, 5),
    ...sessions.filter((session) => session.scenario === "outreach" && session.offset < 0),
  ];
  const reports = reportSessions.map((session, index) => {
    const draft = session.scenario === "foundation" && session.offset === 0;
    const createdAt = afterHours(session.end_at, 0.5);
    return {
      id: randomUUID(),
      organization_id: organizationId,
      class_session_id: session.id,
      author_id: users.coach.id,
      template_version_id: templateId,
      status: "draft",
      submitted_at: null,
      created_at: createdAt,
      updated_at: createdAt,
      targetStatus: draft ? "draft" : "submitted",
      targetSubmittedAt: draft ? null : afterHours(session.end_at, 2),
      content: buildReportContent(session, session.scenario === "foundation" ? index : index - 5),
      session,
    };
  });
  const reportRows = reports.map((report) => ({
    id: report.id,
    organization_id: report.organization_id,
    class_session_id: report.class_session_id,
    author_id: report.author_id,
    template_version_id: report.template_version_id,
    status: report.status,
    submitted_at: report.submitted_at,
    created_at: report.created_at,
    updated_at: report.updated_at,
  }));
  await required(await client.from("reports").insert(reportRows), "보고서 생성");

  const answers = reports.flatMap((report) => [
    { id: randomUUID(), report_id: report.id, field_id: fieldByKey.get("participant").id, value: report.content.participant },
    { id: randomUUID(), report_id: report.id, field_id: fieldByKey.get("mood").id, value: report.content.mood },
    { id: randomUUID(), report_id: report.id, field_id: fieldByKey.get("activities").id, value: report.content.activities },
    { id: randomUUID(), report_id: report.id, field_id: fieldByKey.get("note").id, value: report.content.note },
    { id: randomUUID(), report_id: report.id, field_id: fieldByKey.get("next").id, value: report.content.next },
  ]);
  await required(await client.from("report_answers").insert(answers), "보고서 답변 생성");

  const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "demo", "flag-football-session.jpg");
  const photo = await readFile(fixturePath);
  const photoReports = reports.filter((report) => report.targetStatus === "submitted").slice(-3);
  for (const [index, report] of photoReports.entries()) {
    const attachmentId = randomUUID();
    const storagePath = `${organizationId}/${report.id}/${attachmentId}.jpg`;
    await required(
      await client.storage.from("report-images").upload(storagePath, photo, {
        contentType: "image/jpeg",
        upsert: false,
      }),
      "활동 사진 업로드",
    );
    await required(
      await client.from("report_attachments").insert({
        id: attachmentId,
        organization_id: organizationId,
        report_id: report.id,
        field_id: fieldByKey.get("photo").id,
        storage_path: storagePath,
        original_filename: `플래그풋볼-활동-${index + 1}.jpg`,
        mime_type: "image/jpeg",
        file_size: photo.byteLength,
        width: 1200,
        height: 800,
        created_at: afterHours(report.session.end_at, 1),
      }),
      "활동 사진 정보 생성",
    );
  }

  for (const report of reports.filter((item) => item.targetStatus === "submitted")) {
    await required(
      await client
        .from("reports")
        .update({ status: "submitted", submitted_at: report.targetSubmittedAt })
        .eq("id", report.id),
      "제출 보고서 상태 반영",
    );
  }

  const exportJobId = randomUUID();
  const exportPath = `${organizationId}/${users.admin.id}/${exportJobId}.xlsx`;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("수업 보고서");
  sheet.columns = [
    { header: "수업명", key: "title", width: 30 },
    { header: "수업일", key: "date", width: 14 },
    { header: "작성자", key: "author", width: 14 },
    { header: "상태", key: "status", width: 12 },
    { header: "참여 인원", key: "participant", width: 12 },
    { header: "코치 의견", key: "note", width: 60 },
  ];
  for (const report of reports.filter((item) => item.targetStatus === "submitted")) {
    sheet.addRow({
      title: report.session.title,
      date: report.session.start_at.slice(0, 10),
      author: users.coachProfile.name,
      status: "제출",
      participant: report.content.participant,
      note: report.content.note,
    });
  }
  sheet.getRow(1).font = { bold: true };
  const xlsx = Buffer.from(await workbook.xlsx.writeBuffer());
  await required(
    await client.storage.from("report-exports").upload(exportPath, xlsx, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: false,
    }),
    "내보내기 예시 업로드",
  );
  await required(
    await client.from("export_jobs").insert({
      id: exportJobId,
      organization_id: organizationId,
      requested_by: users.admin.id,
      format: "xlsx",
      filters: { dateFrom: dateAtOffset(-35), dateTo: dateAtOffset(0) },
      status: "completed",
      storage_path: exportPath,
      created_at: atKst(0, "18:10"),
      completed_at: atKst(0, "18:11"),
      expires_at: atKst(7, "18:11"),
    }),
    "내보내기 이력 생성",
  );

  return {
    templateId,
    courses: courses.length,
    sessions: sessions.length,
    scheduledSessions: sessions.filter(
      (session) => session.status === "scheduled" && new Date(session.end_at) > new Date(),
    ).length,
    completedSessions: sessions.filter(
      (session) => session.status === "scheduled" && new Date(session.end_at) <= new Date(),
    ).length,
    cancelledSessions: sessions.filter((session) => session.status === "cancelled").length,
    reports: reports.length,
    submittedReports: reports.filter((report) => report.targetStatus === "submitted").length,
    draftReports: reports.filter((report) => report.targetStatus === "draft").length,
    attachments: photoReports.length,
    exportJobs: 1,
    generatedAt: now,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const adminEmail = String(assertValue(args["admin-email"], "--admin-email이 필요합니다.")).toLowerCase();
  const coachEmail = String(assertValue(args["coach-email"], "--coach-email이 필요합니다.")).toLowerCase();
  const url = assertValue(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL이 필요합니다.");
  const secret = assertValue(process.env.SUPABASE_SECRET_KEY, "SUPABASE_SECRET_KEY가 필요합니다.");
  const client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const users = await findUsers(client, adminEmail, coachEmail);
  const before = await tableCounts(client);

  console.log(JSON.stringify({
    mode: args.confirm === CONFIRMATION ? "apply" : "dry-run",
    organizationId: users.adminProfile.organization_id,
    accounts: [
      { email: adminEmail, role: users.adminProfile.role, status: users.adminProfile.status },
      { email: coachEmail, role: users.coachProfile.role, status: users.coachProfile.status },
    ],
    businessRowsBefore: before,
  }, null, 2));

  if (args.confirm !== CONFIRMATION) {
    console.log(`\n실제 교체하려면 --confirm=${CONFIRMATION}을 추가하세요.`);
    return;
  }

  await required(
    await client.from("profiles").update({ role: "admin", status: "active" }).eq("id", users.admin.id),
    "관리자 역할 설정",
  );
  await required(
    await client.from("profiles").update({ role: "coach", status: "active" }).eq("id", users.coach.id),
    "코치 역할 설정",
  );
  await required(
    await client.from("workspace_memberships").upsert({
      user_id: users.admin.id,
      organization_id: users.adminProfile.organization_id,
      role: "admin",
      status: "active",
    }, { onConflict: "user_id,organization_id" }),
    "관리자 워크스페이스 권한 설정",
  );
  await required(
    await client.from("workspace_memberships").upsert({
      user_id: users.coach.id,
      organization_id: users.coachProfile.organization_id,
      role: "coach",
      status: "active",
    }, { onConflict: "user_id,organization_id" }),
    "코치 워크스페이스 권한 설정",
  );

  const removed = await clearBusinessData(client);
  const created = await seedScenario(client, users);
  const after = await tableCounts(client);
  console.log(JSON.stringify({ removed, created, businessRowsAfter: after }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
