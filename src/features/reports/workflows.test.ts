// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const ids = {
  admin: "10000000-0000-4000-8000-000000000001",
  coach: "10000000-0000-4000-8000-000000000002",
  other: "10000000-0000-4000-8000-000000000003",
  pending: "10000000-0000-4000-8000-000000000005",
  org: "20000000-0000-4000-8000-000000000001",
  otherOrg: "20000000-0000-4000-8000-000000000002",
  session: "30000000-0000-4000-8000-000000000001",
};
let db: PGlite,
  templateId: string,
  reportId: string,
  fieldId: string,
  photoId: string,
  photoPath: string;
async function asUser(id: string) {
  await db.exec(
    `reset role;set request.jwt.claim.sub='${id}';set request.jwt.claim.role='authenticated';set role authenticated;`,
  );
}
async function version() {
  const result = await db.query<{ updated_at: string }>(
    "select updated_at::text from public.reports where id=$1",
    [reportId],
  );
  return result.rows[0].updated_at;
}
describe("reporting PostgreSQL workflows and RLS", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now(),raw_user_meta_data jsonb not null default '{}'::jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
      grant usage on schema auth,storage to authenticated;grant execute on function auth.uid() to authenticated;grant select,insert,delete on storage.objects to authenticated;`);
    for (const file of [
      "202609220001_initial_schema.sql",
      "202609220002_service_role_member_grants.sql",
      "202609220003_reporting_workflows.sql",
      "202609220004_template_names.sql",
      "202609220005_class_recurrence.sql",
      "202609230001_simplify_reports.sql",
    ]) {
      let sql = await readFile("supabase/migrations/" + file, "utf8");
      sql = sql.replace("create extension if not exists pgcrypto;", "");
      await db.exec(sql);
    }
    await db.exec(
      `insert into auth.users(id,email,raw_user_meta_data) values('${ids.admin}','admin@example.com','{}'),('${ids.coach}','coach@example.com','{}'),('${ids.other}','other@example.com','{}'),('${ids.pending}','pending@example.com','{"must_change_password":true}');insert into public.organizations(id,name) values('${ids.org}','기관 A'),('${ids.otherOrg}','기관 B');insert into public.profiles(id,organization_id,name,role,status) values('${ids.admin}','${ids.org}','관리자','admin','active'),('${ids.coach}','${ids.org}','코치','coach','active'),('${ids.other}','${ids.otherOrg}','다른 기관','admin','active'),('${ids.pending}','${ids.org}','초대 대기','coach','active');insert into public.class_sessions(id,organization_id,title,location,start_at,end_at,created_by,updated_by) values('${ids.session}','${ids.org}','수업','서울','2026-09-22 10:00+09','2026-09-22 11:00+09','${ids.coach}','${ids.coach}');`,
    );
    for (const file of [
      "202610060001_add_pending_member_status.sql",
      "202610060002_authorization_hardening.sql",
      "202610060003_export_retention.sql",
      "202610060004_export_cleanup_service_role.sql",
      "202610060005_report_mutation_guards.sql",
      "202610070000_add_completed_status.sql",
      "202610070001_operational_workflow.sql",
      "202610070002_workspace_memberships.sql",
      "202610070003_photo_mutation_version.sql",
      "202610100001_open_signup_workspace_invitations.sql",
    ]) {
      await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
    }
  }, 30000);
  afterAll(async () => {
    await db?.close();
  });
  it("blocks pending members at the database boundary", async () => {
    await asUser(ids.pending);
    expect(
      (
        await db.query<{ active: boolean }>(
          "select public.is_active_member() active",
        )
      ).rows[0].active,
    ).toBe(false);
    expect(
      (await db.query("select id from public.class_sessions")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select id from public.template_versions")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.create_class_schedule($1,$2)", [
        "50000000-0000-4000-8000-000000000099",
        JSON.stringify([]),
      ]),
    ).rejects.toThrow();
  });
  it("creates date-only schedules atomically and deduplicates retries", async () => {
    await asUser(ids.coach);
    const courseId = (
      await db.query<{ course_id: string }>(
        "select course_id from public.class_sessions where id=$1",
        [ids.session],
      )
    ).rows[0].course_id;
    await db.query(
      "update public.courses set title='반복 수업',teaching_method='준비 운동 → 팀 활동',updated_by=$1 where id=$2",
      [ids.coach, courseId],
    );
    const token = "50000000-0000-4000-8000-000000000001";
    const item = {
      title: "반복 수업",
      location: "센터",
      start_at: "2026-09-21T15:00:00Z",
      end_at: "2026-09-22T15:00:00Z",
      has_time: false,
      memo: null,
      teaching_method: "준비 운동 → 팀 활동",
    };
    const items = JSON.stringify([
      item,
      {
        ...item,
        start_at: "2026-09-22T15:00:00Z",
        end_at: "2026-09-23T15:00:00Z",
      },
    ]);
    const first = await db.query<{ id: string }>(
      "select public.create_class_schedule($1,$2,$3) as id",
      [token, courseId, items],
    );
    const retry = await db.query<{ id: string }>(
      "select public.create_class_schedule($1,$2,$3) as id",
      [token, courseId, items],
    );
    expect(retry.rows[0].id).toBe(first.rows[0].id);
    expect(
      (
        await db.query<{ teaching_method: string }>(
          "select teaching_method from public.class_sessions where id=$1",
          [first.rows[0].id],
        )
      ).rows[0].teaching_method,
    ).toBe("준비 운동 → 팀 활동");
    expect(
      (
        await db.query(
          "select id from public.class_sessions where registration_id=$1",
          [token],
        )
      ).rows,
    ).toHaveLength(2);
    const failToken = "50000000-0000-4000-8000-000000000002";
    await expect(
      db.query("select public.create_class_schedule($1,$2,$3)", [
        failToken,
        courseId,
        JSON.stringify([item, { ...item, end_at: item.start_at }]),
      ]),
    ).rejects.toThrow();
    expect(
      (
        await db.query(
          "select id from public.class_sessions where registration_id=$1",
          [failToken],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("publishes a template atomically and rejects coach template creation", async () => {
    await asUser(ids.coach);
    await expect(
      db.query("select public.save_template(null,null,$1,true)", [
        JSON.stringify([
          {
            label: "내용",
            help_text: "",
            field_type: "short_text",
            required: true,
          },
        ]),
      ]),
    ).rejects.toThrow();
    await asUser(ids.admin);
    const result = await db.query<{ id: string }>(
      "select public.save_template(null,null,$1,true) as id",
      [
        JSON.stringify([
          {
            label: "내용",
            help_text: "",
            field_type: "short_text",
            required: true,
          },
          {
            label: "사진",
            help_text: "",
            field_type: "photo",
            required: false,
            max_files: 1,
          },
        ]),
      ],
    );
    templateId = result.rows[0].id;
    const f = await db.query<{ id: string }>(
      "select id from public.template_fields where template_version_id=$1 and field_type='short_text'",
      [templateId],
    );
    fieldId = f.rows[0].id;
    await expect(
      db.query("update public.template_fields set label='수정' where id=$1", [
        fieldId,
      ]),
    ).rejects.toThrow();
    expect(
      (
        await db.query<{ label: string }>(
          "select label from public.template_fields where id=$1",
          [fieldId],
        )
      ).rows[0].label,
    ).toBe("내용");

    const draft = await db.query<{ id: string }>(
      "select public.save_template(null,null,$1,false) as id",
      [
        JSON.stringify([
          {
            label: "관리자 초안",
            help_text: "",
            field_type: "single_select",
            required: false,
            options: ["비공개 선택지"],
          },
        ]),
      ],
    );
    const draftId = draft.rows[0].id;
    const draftOptionId = (
      await db.query<{ id: string }>(
        "select o.id from public.field_options o join public.template_fields f on f.id=o.field_id where f.template_version_id=$1",
        [draftId],
      )
    ).rows[0].id;
    await asUser(ids.coach);
    expect(
      (
        await db.query("select id from public.template_versions where id=$1", [
          draftId,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query("select id from public.field_options where id=$1", [
          draftOptionId,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "select id from public.template_fields where template_version_id=$1",
          [draftId],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query("select id from public.template_versions where id=$1", [
          templateId,
        ])
      ).rows,
    ).toHaveLength(1);
  });
  it("renames a template without changing its version or fields", async () => {
    await asUser(ids.coach);
    await expect(
      db.query("select public.rename_template($1,'기본 양식')", [templateId]),
    ).rejects.toThrow();
    await asUser(ids.admin);
    await db.query("select public.rename_template($1,'기본 양식')", [
      templateId,
    ]);
    const result = await db.query<{ name: string; version: number }>(
      "select name,version from public.template_versions where id=$1",
      [templateId],
    );
    expect(result.rows[0]).toEqual({ name: "기본 양식", version: 1 });
    expect(
      (
        await db.query("select id from public.template_fields where id=$1", [
          fieldId,
        ])
      ).rows,
    ).toHaveLength(1);
  });
  it("creates exactly one report and enforces required submission fields", async () => {
    await asUser(ids.coach);
    const created = await db.query<{ id: string }>(
      "select id from public.get_or_create_report($1)",
      [ids.session],
    );
    reportId = created.rows[0].id;
    const again = await db.query<{ id: string }>(
      "select id from public.get_or_create_report($1)",
      [ids.session],
    );
    expect(again.rows[0].id).toBe(reportId);
    await expect(
      db.query("select public.save_and_submit_report($1,$2,'[]',true)", [
        reportId,
        await version(),
      ]),
    ).rejects.toThrow();
    await db.query("select public.save_and_submit_report($1,$2,$3,true)", [
      reportId,
      await version(),
      JSON.stringify([{ fieldId, value: "수업 완료" }]),
    ]);
  });
  it("lets an administrator edit and resubmit another member's report", async () => {
    await asUser(ids.admin);
    await db.query("select public.save_and_submit_report($1,$2,$3,false)", [
      reportId,
      await version(),
      JSON.stringify([{ fieldId, value: "관리자 수정" }]),
    ]);
    expect(
      (
        await db.query<{ value: string }>(
          "select value #>> '{}' value from public.report_answers where report_id=$1 and field_id=$2",
          [reportId, fieldId],
        )
      ).rows[0].value,
    ).toBe("관리자 수정");
    await db.query("select public.save_and_submit_report($1,$2,$3,true)", [
      reportId,
      await version(),
      JSON.stringify([{ fieldId, value: "관리자 수정" }]),
    ]);
  });
  it("hides reports and sessions from another organization", async () => {
    await asUser(ids.other);
    expect((await db.query("select * from public.reports")).rows).toHaveLength(
      0,
    );
    expect(
      (await db.query("select * from public.class_sessions")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.get_or_create_report($1)", [ids.session]),
    ).rejects.toThrow();
  });
  it("removes approval and permits draft saves after submission, rejecting stale saves", async () => {
    await asUser(ids.admin);
    await expect(
      db.query("select public.confirm_report_version($1,$2)", [
        reportId,
        await version(),
      ]),
    ).rejects.toThrow();
    await asUser(ids.coach);
    const old = await version();
    await db.query("select public.save_and_submit_report($1,$2,$3,false)", [
      reportId,
      old,
      JSON.stringify([{ fieldId, value: "수정된 내용" }]),
    ]);
    expect(
      (
        await db.query<{ confirmed_at: null }>(
          "select confirmed_at from public.reports where id=$1",
          [reportId],
        )
      ).rows[0].confirmed_at,
    ).toBeNull();
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.reports where id=$1",
          [reportId],
        )
      ).rows[0].status,
    ).toBe("draft");
    const conflictStartedAt = performance.now();
    await expect(
      db.query("select public.save_and_submit_report($1,$2,'[]',false)", [
        reportId,
        old,
      ]),
    ).rejects.toMatchObject({ code: "PT409" });
    expect(performance.now() - conflictStartedAt).toBeLessThan(1000);
  });
  it("protects the last administrator and cross-organization members", async () => {
    await asUser(ids.admin);
    await expect(
      db.query("select public.manage_member($1,'coach','active')", [ids.admin]),
    ).rejects.toThrow();
    await expect(
      db.query("select public.manage_member($1,'coach','inactive')", [
        ids.other,
      ]),
    ).rejects.toThrow();
    await expect(
      db.query("select public.manage_member($1,'coach','active')", [
        ids.pending,
      ]),
    ).rejects.toThrow();
    await expect(
      db.query("select public.manage_member($1,'coach','pending')", [
        ids.coach,
      ]),
    ).rejects.toThrow();
  });
  it("requires stored photos, enforces count, and returns changed attachments to draft", async () => {
    await asUser(ids.coach);
    const photo = (
      await db.query<{ id: string }>(
        "select id from public.template_fields where template_version_id=$1 and field_type='photo'",
        [templateId],
      )
    ).rows[0].id;
    const file = `${ids.org}/${reportId}/40000000-0000-4000-8000-000000000001.jpg`;
    const insert =
      "insert into public.report_attachments(organization_id,report_id,field_id,storage_path,original_filename,file_size) values($1,$2,$3,$4,'photo.jpg',123)";
    await expect(
      db.query(insert, [ids.org, reportId, photo, file]),
    ).rejects.toThrow();
    await db.query(
      "insert into storage.objects(bucket_id,name) values('report-images',$1)",
      [file],
    );
    const inserted = await db.query<{ id: string }>(insert + " returning id", [
      ids.org,
      reportId,
      photo,
      file,
    ]);
    photoId = inserted.rows[0].id;
    photoPath = file;
    const file2 = file.replace("000001.jpg", "000002.jpg");
    await db.query(
      "insert into storage.objects(bucket_id,name) values('report-images',$1)",
      [file2],
    );
    await expect(
      db.query(insert, [ids.org, reportId, photo, file2]),
    ).rejects.toThrow();
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.reports where id=$1",
          [reportId],
        )
      ).rows[0].status,
    ).toBe("draft");
  });
  it("lets administrators manage another author's photos", async () => {
    await asUser(ids.admin);
    expect(
      (
        await db.query(
          "delete from public.report_attachments where id=$1 returning id",
          [photoId],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "delete from storage.objects where bucket_id='report-images' and name=$1 returning name",
          [photoPath],
        )
      ).rows,
    ).toHaveLength(1);

    await db.query(
      "insert into storage.objects(bucket_id,name) values('report-images',$1)",
      [photoPath],
    );
    const restored = await db.query<{ id: string }>(
      "insert into public.report_attachments(organization_id,report_id,field_id,storage_path,original_filename,file_size) values($1,$2,$3,$4,'photo.jpg',123) returning id",
      [
        ids.org,
        reportId,
        photoId
          ? (
              await db.query<{ field_id: string }>(
                "select id field_id from public.template_fields where template_version_id=$1 and field_type='photo'",
                [templateId],
              )
            ).rows[0].field_id
          : fieldId,
        photoPath,
      ],
    );
    photoId = restored.rows[0].id;
  });
  it("rejects submission for a cancelled class", async () => {
    await asUser(ids.coach);
    await db.query("select public.cancel_class_session($1)", [ids.session]);
    await expect(
      db.query(
        "update public.class_sessions set status='scheduled',updated_by=$1 where id=$2",
        [ids.coach, ids.session],
      ),
    ).rejects.toThrow();
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.class_sessions where id=$1",
          [ids.session],
        )
      ).rows[0].status,
    ).toBe("cancelled");
    await expect(
      db.query("select public.get_or_create_report($1)", [ids.session]),
    ).rejects.toThrow();
    await expect(
      db.query("select public.save_and_submit_report($1,$2,$3,true)", [
        reportId,
        await version(),
        JSON.stringify([{ fieldId, value: "수업 완료" }]),
      ]),
    ).rejects.toMatchObject({ code: "PT409" });
    await expect(
      db.query("select public.save_and_submit_report($1,$2,$3,false)", [
        reportId,
        await version(),
        JSON.stringify([{ fieldId, value: "수정 시도" }]),
      ]),
    ).rejects.toMatchObject({ code: "PT409" });

    const cancelledPath = `${ids.org}/${reportId}/40000000-0000-4000-8000-000000000003.jpg`;
    await expect(
      db.query(
        "insert into storage.objects(bucket_id,name) values('report-images',$1)",
        [cancelledPath],
      ),
    ).rejects.toThrow();

    await db.exec("reset role");
    await db.query(
      "insert into storage.objects(bucket_id,name) values('report-images',$1)",
      [cancelledPath],
    );
    await asUser(ids.coach);
    const photoField = (
      await db.query<{ id: string }>(
        "select id from public.template_fields where template_version_id=$1 and field_type='photo'",
        [templateId],
      )
    ).rows[0].id;
    await expect(
      db.query(
        "insert into public.report_attachments(organization_id,report_id,field_id,storage_path,original_filename,file_size) values($1,$2,$3,$4,'photo.jpg',123)",
        [ids.org, reportId, photoField, cancelledPath],
      ),
    ).rejects.toThrow();
    expect(
      (
        await db.query(
          "delete from public.report_attachments where id=$1 returning id",
          [photoId],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "delete from storage.objects where bucket_id='report-images' and name=$1 returning name",
          [photoPath],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("isolates another coach's reports and private photos in the same organization", async () => {
    const second = "10000000-0000-4000-8000-000000000004";
    await db.exec(
      `reset role;insert into auth.users values('${second}');insert into public.profiles(id,organization_id,name) values('${second}','${ids.org}','다른 코치');`,
    );
    await asUser(second);
    expect(
      (await db.query("select id from public.reports where id=$1", [reportId]))
        .rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "select name from storage.objects where bucket_id='report-images'",
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.confirm_report_version($1,now())", [reportId]),
    ).rejects.toThrow();
    await expect(
      db.query("select public.save_and_submit_report($1,now(),'[]',false)", [
        reportId,
      ]),
    ).rejects.toThrow();
  });
  it("archives older templates without changing existing report versions", async () => {
    await asUser(ids.admin);
    const next = await db.query<{ id: string }>(
      "select public.save_template(null,null,$1,true) as id",
      [
        JSON.stringify([
          {
            label: "새 질문",
            help_text: "",
            field_type: "number",
            required: false,
          },
        ]),
      ],
    );
    expect(next.rows[0].id).not.toBe(templateId);
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.template_versions where id=$1",
          [templateId],
        )
      ).rows[0].status,
    ).toBe("archived");
    expect(
      (
        await db.query<{ template_version_id: string }>(
          "select template_version_id from public.reports where id=$1",
          [reportId],
        )
      ).rows[0].template_version_id,
    ).toBe(templateId);
    await asUser(ids.coach);
    expect(
      (
        await db.query("select id from public.template_versions where id=$1", [
          templateId,
        ])
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select id from public.template_fields where template_version_id=$1",
          [templateId],
        )
      ).rows.length,
    ).toBeGreaterThan(0);
  });
  it("isolates export history and storage from coaches and other organizations", async () => {
    await asUser(ids.admin);
    await db.query(
      "insert into public.export_jobs(organization_id,requested_by,format) values($1,$2,'pdf')",
      [ids.org, ids.admin],
    );
    expect(
      (
        await db.query<{ retention_days: number }>(
          "select extract(day from expires_at-created_at)::int retention_days from public.export_jobs where requested_by=$1",
          [ids.admin],
        )
      ).rows[0].retention_days,
    ).toBe(7);
    await db.query(
      "insert into storage.objects(bucket_id,name) values('report-exports',$1)",
      [`${ids.org}/${ids.admin}/report.pdf`],
    );
    await asUser(ids.coach);
    expect(
      (await db.query("select id from public.export_jobs")).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "select name from storage.objects where bucket_id='report-exports'",
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        "insert into public.export_jobs(organization_id,requested_by,format) values($1,$2,'pdf')",
        [ids.org, ids.coach],
      ),
    ).rejects.toThrow();
    await asUser(ids.other);
    expect(
      (await db.query("select id from public.export_jobs")).rows,
    ).toHaveLength(0);
  });
  it("lets the service role clear expired export storage references", async () => {
    await db.exec("reset role");
    const inserted = await db.query<{ id: string }>(
      "insert into public.export_jobs(organization_id,requested_by,format,storage_path,expires_at) values($1,$2,'pdf','expired/report.pdf',now()-interval '1 day') returning id",
      [ids.org, ids.admin],
    );

    await db.exec("set role service_role");
    expect(
      (
        await db.query(
          "select id from public.export_jobs where id=$1 and expires_at<=now()",
          [inserted.rows[0].id],
        )
      ).rows,
    ).toHaveLength(1);
    await db.query(
      "update public.export_jobs set storage_path=null where id=$1",
      [inserted.rows[0].id],
    );
    expect(
      (
        await db.query<{ storage_path: string | null }>(
          "select storage_path from public.export_jobs where id=$1",
          [inserted.rows[0].id],
        )
      ).rows[0].storage_path,
    ).toBeNull();

    await db.exec("reset role");
    await db.query("delete from public.export_jobs where id=$1", [
      inserted.rows[0].id,
    ]);
  });
  it("automatically persists completed sessions and lets admins edit course masters", async () => {
    await asUser(ids.admin);
    const courseId = (
      await db.query<{ course_id: string }>(
        "select course_id from public.class_sessions where id=$1",
        [ids.session],
      )
    ).rows[0].course_id;
    await db.query(
      "update public.courses set location='관리자 수정 장소',updated_by=$1 where id=$2",
      [ids.admin, courseId],
    );
    expect(
      (
        await db.query<{ location: string }>(
          "select location from public.courses where id=$1",
          [courseId],
        )
      ).rows[0].location,
    ).toBe("관리자 수정 장소");

    const past = (
      await db.query<{ id: string }>(
        "insert into public.class_sessions(organization_id,course_id,title,location,start_at,end_at,created_by,updated_by) values($1,$2,'지난 수업','센터',now()-interval '2 hours',now()-interval '1 hour',$3,$3) returning id",
        [ids.org, courseId, ids.admin],
      )
    ).rows[0].id;
    await db.query("select public.sync_completed_class_sessions($1)", [
      ids.org,
    ]);
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.class_sessions where id=$1",
          [past],
        )
      ).rows[0].status,
    ).toBe("completed");
    await db.query(
      "update public.class_sessions set start_at=now()+interval '1 hour',end_at=now()+interval '2 hours',updated_by=$1 where id=$2",
      [ids.admin, past],
    );
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.class_sessions where id=$1",
          [past],
        )
      ).rows[0].status,
    ).toBe("scheduled");
  });
  it("soft-deletes a logical template while retaining historical report versions", async () => {
    await asUser(ids.admin);
    const active = (
      await db.query<{ id: string }>(
        "select id from public.template_versions where organization_id=$1 and status='active' and hidden_at is null",
        [ids.org],
      )
    ).rows[0].id;
    await db.query("select public.deactivate_template($1)", [active]);
    expect(
      (
        await db.query<{ status: string; hidden: boolean }>(
          "select status,hidden_at is not null hidden from public.template_versions where id=$1",
          [active],
        )
      ).rows[0],
    ).toEqual({ status: "archived", hidden: true });
    expect(
      (await db.query("select id from public.reports where id=$1", [reportId]))
        .rows,
    ).toHaveLength(1);
    await asUser(ids.coach);
    expect(
      (
        await db.query("select id from public.template_versions where id=$1", [
          active,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query("select id from public.template_versions where id=$1", [
          templateId,
        ])
      ).rows,
    ).toHaveLength(1);
  });
  it("switches workspaces without mixing data and keeps roles workspace-specific", async () => {
    await asUser(ids.admin);
    const workspaceId = (
      await db.query<{ id: string }>("select public.create_workspace($1) id", [
        "기관 C",
      ])
    ).rows[0].id;

    expect(
      (
        await db.query<{ organization_id: string; role: string }>(
          "select organization_id,role from public.profiles where id=$1",
          [ids.admin],
        )
      ).rows[0],
    ).toEqual({ organization_id: workspaceId, role: "admin" });
    expect(
      (await db.query("select id from public.class_sessions")).rows,
    ).toHaveLength(0);

    // Seed pre-existing memberships as database owner; the obsolete public
    // helper cannot grant access under the invitation policy.
    await db.exec("reset role");
    await db.query(
      "insert into public.workspace_memberships(user_id,organization_id,role,status) values($1,$3,'coach','active'),($2,$3,'coach','pending')",
      [ids.coach, ids.pending, workspaceId],
    );
    await asUser(ids.admin);
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.workspace_memberships where user_id=$1 and organization_id=$2",
          [ids.pending, workspaceId],
        )
      ).rows[0].status,
    ).toBe("pending");
    await db.query("select public.manage_member($1,'admin','active')", [
      ids.coach,
    ]);
    await db.query("select public.switch_workspace($1)", [ids.org]);

    await asUser(ids.coach);
    expect(
      (
        await db.query<{ count: number }>(
          "select count(*)::int count from public.workspace_memberships where user_id=$1",
          [ids.coach],
        )
      ).rows[0].count,
    ).toBe(2);
    await db.query("select public.switch_workspace($1)", [workspaceId]);
    expect(
      (
        await db.query<{ role: string }>(
          "select public.current_user_role() role",
        )
      ).rows[0].role,
    ).toBe("admin");
    expect(
      (await db.query("select id from public.class_sessions")).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "update public.class_sessions set title='다른 워크스페이스 침범' where id=$1 returning id",
          [ids.session],
        )
      ).rows,
    ).toHaveLength(0);
    await db.query("select public.switch_workspace($1)", [ids.org]);
    expect(
      (
        await db.query<{ role: string }>(
          "select public.current_user_role() role",
        )
      ).rows[0].role,
    ).toBe("coach");
    expect(
      (
        await db.query("select id from public.class_sessions where id=$1", [
          ids.session,
        ])
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query<{ title: string }>(
          "select title from public.class_sessions where id=$1",
          [ids.session],
        )
      ).rows[0].title,
    ).toBe("수업");

    await asUser(ids.other);
    await expect(
      db.query("select public.switch_workspace($1)", [workspaceId]),
    ).rejects.toThrow();
  });
  it("keeps workspace members visible after they select another workspace", async () => {
    await asUser(ids.admin);
    const workspaceId = (
      await db.query<{ id: string }>(
        "select public.create_workspace('작성자 필터 QA') id",
      )
    ).rows[0].id;
    await db.exec("reset role");
    await db.query(
      "insert into public.workspace_memberships(user_id,organization_id) values($1,$2)",
      [ids.coach, workspaceId],
    );
    await asUser(ids.admin);
    await db.query("select public.switch_workspace($1)", [ids.org]);
    await asUser(ids.coach);
    await db.query("select public.switch_workspace($1)", [workspaceId]);
    await asUser(ids.admin);
    const { rows } = await db.query<{ id: string; name: string }>(
      "select wm.user_id id,p.name from public.workspace_memberships wm join public.profiles p on p.id=wm.user_id where wm.organization_id=$1 and wm.user_id=$2",
      [ids.org, ids.coach],
    );
    expect(rows).toEqual([{ id: ids.coach, name: "코치" }]);
    await asUser(ids.coach);
    await db.query("select public.switch_workspace($1)", [ids.org]);
  });
  it("returns atomic photo revisions and rejects stale photo or answer writes", async () => {
    await db.exec("reset role");
    const session = (
      await db.query<{ id: string }>(
        "insert into public.class_sessions(organization_id,course_id,title,location,start_at,end_at,created_by,updated_by) select $1,course_id,'사진 버전 QA','센터',now()+interval '1 day',now()+interval '2 days',$2,$2 from public.class_sessions where id=$3 returning id",
        [ids.org, ids.coach, ids.session],
      )
    ).rows[0].id;
    const report = (
      await db.query<{ id: string }>(
        "insert into public.reports(organization_id,class_session_id,author_id,template_version_id) values($1,$2,$3,$4) returning id",
        [ids.org, session, ids.coach, templateId],
      )
    ).rows[0].id;
    await asUser(ids.coach);
    const revision = async () =>
      (
        await db.query<{ version: string }>(
          "select updated_at::text version from public.reports where id=$1",
          [report],
        )
      ).rows[0].version;
    const oldVersion = await revision();
    const photo = (
      await db.query<{ id: string }>(
        "select id from public.template_fields where template_version_id=$1 and field_type='photo'",
        [templateId],
      )
    ).rows[0].id;
    const path = `${ids.org}/${report}/40000000-0000-4000-8000-000000000009.jpg`;
    await db.query(
      "insert into storage.objects(bucket_id,name) values('report-images',$1)",
      [path],
    );
    const added = (
      await db.query<{
        result: { attachment: { id: string }; version: string };
      }>("select public.mutate_report_photo($1,$2,'insert',$3) result", [
        report,
        oldVersion,
        JSON.stringify({ field_id: photo, storage_path: path, file_size: 123 }),
      ])
    ).rows[0].result;
    await expect(
      db.query("select public.save_and_submit_report($1,$2,'[]',false)", [
        report,
        oldVersion,
      ]),
    ).rejects.toMatchObject({ code: "PT409" });
    await db.query("select public.save_and_submit_report($1,$2,$3,false)", [
      report,
      added.version,
      JSON.stringify([{ fieldId, value: "최신 답변" }]),
    ]);
    await expect(
      db.query("select public.mutate_report_photo($1,$2,'delete',$3)", [
        report,
        added.version,
        JSON.stringify({ id: added.attachment.id }),
      ]),
    ).rejects.toMatchObject({ code: "PT409" });
    const latest = await revision();
    const deleted = (
      await db.query<{ result: { version: string } }>(
        "select public.mutate_report_photo($1,$2,'delete',$3) result",
        [report, latest, JSON.stringify({ id: added.attachment.id })],
      )
    ).rows[0].result;
    await db.query("select public.save_and_submit_report($1,$2,$3,true)", [
      report,
      deleted.version,
      JSON.stringify([{ fieldId, value: "최신 답변" }]),
    ]);
    expect(
      (
        await db.query(
          "select id from public.report_attachments where report_id=$1",
          [report],
        )
      ).rows,
    ).toHaveLength(0);
    await asUser(ids.other);
    await expect(
      db.query("select public.mutate_report_photo($1,$2,'delete',$3)", [
        report,
        deleted.version,
        JSON.stringify({ id: added.attachment.id }),
      ]),
    ).rejects.toThrow();
  });
  it("rejects direct member helpers that bypass pending and last-admin guards", async () => {
    await asUser(ids.admin);
    await expect(
      db.query("select public.change_member_status($1,'active')", [
        ids.pending,
      ]),
    ).rejects.toThrow();
    await expect(
      db.query("select public.change_member_role($1,'admin')", [ids.pending]),
    ).rejects.toThrow();
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.workspace_memberships where user_id=$1 and organization_id=$2",
          [ids.pending, ids.org],
        )
      ).rows[0].status,
    ).toBe("pending");
  });
  it("cannot activate pending memberships by password setup through the service role", async () => {
    await db.exec(
      "reset role;set request.jwt.claim.role='service_role';set role service_role",
    );
    await expect(
      db.query("select public.activate_invited_user($1)", [ids.pending]),
    ).rejects.toThrow();
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.workspace_memberships where user_id=$1 and organization_id=$2",
          [ids.pending, ids.org],
        )
      ).rows[0].status,
    ).toBe("pending");
  });
  async function newAccount(verified = true) {
    await db.exec("reset role");
    const id = (await db.query<{ id: string }>("select gen_random_uuid() id"))
      .rows[0].id;
    const email = `${id}@example.com`;
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,$3,$4)",
      [
        id,
        email,
        verified ? "2026-10-10T00:00:00Z" : null,
        JSON.stringify({
          name: "공개 가입",
          role: "admin",
          organization_id: ids.org,
        }),
      ],
    );
    return { id, email };
  }
  async function invite(email: string) {
    await asUser(ids.admin);
    await db.query("select public.switch_workspace($1)", [ids.org]);
    const token = randomBytes(32).toString("hex");
    const id = (
      await db.query<{ id: string }>(
        "select public.create_workspace_invitation($1,$2) id",
        [email, createHash("sha256").update(token).digest("hex")],
      )
    ).rows[0].id;
    return { token, id };
  }
  it("provisions a verified public account without trusting metadata for permissions", async () => {
    const account = await newAccount();
    await asUser(account.id);
    await db.query("select public.ensure_my_profile()");
    await db.query("select public.ensure_my_profile()");
    expect(
      (
        await db.query(
          "select organization_id,role,status from public.profiles where id=$1",
          [account.id],
        )
      ).rows,
    ).toEqual([{ organization_id: null, role: "coach", status: "active" }]);
    expect(
      (await db.query("select id from public.workspace_memberships")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select id from public.class_sessions")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select id from public.organizations")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.switch_workspace($1)", [ids.org]),
    ).rejects.toThrow();
  });
  it("allows verified accounts to create their own workspace while keeping other data private", async () => {
    const account = await newAccount();
    await asUser(account.id);
    const org = (
      await db.query<{ id: string }>(
        "select public.create_workspace('내 워크스페이스') id",
      )
    ).rows[0].id;
    expect(
      (
        await db.query(
          "select organization_id,role,status from public.workspace_memberships",
        )
      ).rows,
    ).toEqual([{ organization_id: org, role: "admin", status: "active" }]);
    expect(
      (await db.query("select id from public.class_sessions")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.switch_workspace($1)", [ids.org]),
    ).rejects.toThrow();
  });
  it("requires verified email for signup provisioning, workspace creation and acceptance", async () => {
    const account = await newAccount(false);
    const invitation = await invite(account.email);
    await asUser(account.id);
    await expect(
      db.query("select public.ensure_my_profile()"),
    ).rejects.toThrow();
    await expect(
      db.query("select public.create_workspace('미인증 기관')"),
    ).rejects.toThrow();
    await expect(
      db.query("select public.accept_workspace_invitation($1)", [
        invitation.token,
      ]),
    ).rejects.toThrow();
  });
  it("keeps an existing registered user outside a workspace until explicit acceptance", async () => {
    const invitation = await invite("other@example.com");
    await asUser(ids.other);
    expect(
      (
        await db.query(
          "select id from public.workspace_memberships where organization_id=$1",
          [ids.org],
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.switch_workspace($1)", [ids.org]),
    ).rejects.toThrow();
    expect(
      (
        await db.query(
          "select workspace_name from public.get_workspace_invitation($1)",
          [invitation.token],
        )
      ).rows,
    ).toEqual([{ workspace_name: "기관 A" }]);
    // Rendering the landing page did not accept the invitation.
    await expect(
      db.query("select public.switch_workspace($1)", [ids.org]),
    ).rejects.toThrow();
    await db.query("select public.accept_workspace_invitation($1)", [
      invitation.token,
    ]);
    expect(
      (await db.query("select public.current_user_role() role")).rows[0],
    ).toEqual({ role: "coach" });
    expect(
      (
        await db.query("select id from public.class_sessions where id=$1", [
          ids.session,
        ])
      ).rows,
    ).toHaveLength(1);
    await db.query("select public.switch_workspace($1)", [ids.otherOrg]);
    expect(
      (await db.query("select public.current_user_role() role")).rows[0],
    ).toEqual({ role: "admin" });
  });
  it("atomically provisions and accepts a new account as a coach", async () => {
    const account = await newAccount();
    const invitation = await invite(account.email);
    await asUser(account.id);
    await db.query("select public.accept_workspace_invitation($1)", [
      invitation.token,
    ]);
    expect(
      (
        await db.query(
          "select organization_id,role,status from public.profiles where id=$1",
          [account.id],
        )
      ).rows[0],
    ).toEqual({ organization_id: ids.org, role: "coach", status: "active" });
    await expect(
      db.query("select public.create_workspace_invitation($1,$2)", [
        "someone@example.com",
        "b".repeat(64),
      ]),
    ).rejects.toThrow();
  });
  it("rejects another verified email and exposes no invitation details", async () => {
    const target = await newAccount();
    const wrong = await newAccount();
    const invitation = await invite(target.email);
    await asUser(wrong.id);
    expect(
      (
        await db.query("select * from public.get_workspace_invitation($1)", [
          invitation.token,
        ])
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.accept_workspace_invitation($1)", [
        invitation.token,
      ]),
    ).rejects.toThrow();
  });
  it("uses the current verified auth email rather than stale session or profile data", async () => {
    const target = await newAccount();
    const invitation = await invite(target.email);
    await db.exec("reset role");
    await db.query(
      "update auth.users set email='changed@example.com' where id=$1",
      [target.id],
    );
    await asUser(target.id);
    await expect(
      db.query("select public.accept_workspace_invitation($1)", [
        invitation.token,
      ]),
    ).rejects.toThrow();
  });
  it("expires invitations and rejects unknown or malformed tokens", async () => {
    const target = await newAccount();
    const invitation = await invite(target.email);
    await db.exec("reset role");
    await db.query(
      "update public.workspace_invitations set expires_at=now()-interval '1 second' where id=$1",
      [invitation.id],
    );
    await asUser(target.id);
    await expect(
      db.query("select public.accept_workspace_invitation($1)", [
        invitation.token,
      ]),
    ).rejects.toThrow();
    await expect(
      db.query("select public.accept_workspace_invitation($1)", [
        "c".repeat(64),
      ]),
    ).rejects.toThrow();
    await expect(
      db.query("select public.accept_workspace_invitation($1)", ["bad"]),
    ).rejects.toThrow();
  });
  it("invalidates the previous link when resending and deduplicates pending invitations", async () => {
    const target = await newAccount();
    const first = await invite(target.email);
    const second = await invite(target.email);
    expect(first.id).toBe(second.id);
    await asUser(target.id);
    await expect(
      db.query("select public.accept_workspace_invitation($1)", [first.token]),
    ).rejects.toThrow();
    await db.query("select public.accept_workspace_invitation($1)", [
      second.token,
    ]);
  });
  it("deduplicates acceptance and cannot restore a subsequently disabled membership", async () => {
    const target = await newAccount();
    const invitation = await invite(target.email);
    await asUser(target.id);
    await db.query("select public.accept_workspace_invitation($1)", [
      invitation.token,
    ]);
    await db.query("select public.accept_workspace_invitation($1)", [
      invitation.token,
    ]);
    expect(
      (
        await db.query(
          "select id from public.workspace_memberships where organization_id=$1",
          [ids.org],
        )
      ).rows,
    ).toHaveLength(1);
    await db.exec("reset role");
    await db.query(
      "update public.workspace_memberships set status='inactive' where user_id=$1 and organization_id=$2",
      [target.id, ids.org],
    );
    await asUser(target.id);
    await expect(
      db.query("select public.accept_workspace_invitation($1)", [
        invitation.token,
      ]),
    ).rejects.toThrow();
    expect(
      (
        await db.query(
          "select status from public.workspace_memberships where organization_id=$1",
          [ids.org],
        )
      ).rows[0],
    ).toEqual({ status: "inactive" });
  });
  it("scopes invitation visibility and removes legacy authenticated grant bypasses", async () => {
    await asUser(ids.coach);
    expect(
      (await db.query("select id from public.workspace_invitations")).rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        "select public.find_workspace_user_by_email('other@example.com')",
      ),
    ).rejects.toThrow();
    await expect(
      db.query("select public.add_existing_workspace_member($1)", [ids.other]),
    ).rejects.toThrow();
    await expect(
      db.query("select public.register_workspace_invitee($1,'침범')", [
        ids.other,
      ]),
    ).rejects.toThrow();
    await expect(
      db.query(
        "select public.create_workspace_invitation('new@example.com',$1)",
        ["d".repeat(64)],
      ),
    ).rejects.toThrow();
    await asUser(ids.admin);
    expect(
      (
        await db.query(
          "select id from public.workspace_invitations where organization_id=$1",
          [ids.otherOrg],
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.add_existing_workspace_member($1)", [ids.other]),
    ).rejects.toThrow();
  });
  it("guards the new nullable profile workspace boundary", async () => {
    const target = await newAccount();
    await asUser(target.id);
    await db.query("select public.ensure_my_profile()");
    await db.exec("reset role");
    await expect(
      db.query("update public.profiles set organization_id=$1 where id=$2", [
        ids.org,
        target.id,
      ]),
    ).rejects.toThrow();
  });

  it("does not restore a disabled administrator's role through re-invitation", async () => {
    const target = await newAccount();
    await asUser(target.id);
    await db.query("select public.ensure_my_profile()");
    await db.exec("reset role");
    await db.query(
      "insert into public.workspace_memberships(user_id,organization_id,role,status) values($1,$2,'admin','inactive')",
      [target.id, ids.org],
    );
    const invitation = await invite(target.email);
    await asUser(target.id);
    await db.query("select public.accept_workspace_invitation($1)", [
      invitation.token,
    ]);
    expect(
      (
        await db.query(
          "select role,status from public.workspace_memberships where organization_id=$1",
          [ids.org],
        )
      ).rows,
    ).toEqual([{ role: "coach", status: "active" }]);
  });
});
