// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
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
    `reset role;set request.jwt.claim.sub='${id}';set role authenticated;`,
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
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}'::jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
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
      `insert into auth.users(id,raw_user_meta_data) values('${ids.admin}','{}'),('${ids.coach}','{}'),('${ids.other}','{}'),('${ids.pending}','{"must_change_password":true}');insert into public.organizations(id,name) values('${ids.org}','기관 A'),('${ids.otherOrg}','기관 B');insert into public.profiles(id,organization_id,name,role,status) values('${ids.admin}','${ids.org}','관리자','admin','active'),('${ids.coach}','${ids.org}','코치','coach','active'),('${ids.other}','${ids.otherOrg}','다른 기관','admin','active'),('${ids.pending}','${ids.org}','초대 대기','coach','active');insert into public.class_sessions(id,organization_id,title,location,start_at,end_at,created_by,updated_by) values('${ids.session}','${ids.org}','수업','서울','2026-09-22 10:00+09','2026-09-22 11:00+09','${ids.coach}','${ids.coach}');`,
    );
    for (const file of [
      "202610060001_add_pending_member_status.sql",
      "202610060002_authorization_hardening.sql",
      "202610060003_export_retention.sql",
      "202610060004_export_cleanup_service_role.sql",
      "202610060005_report_mutation_guards.sql",
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
      (await db.query<{ active: boolean }>("select public.is_active_member() active"))
        .rows[0].active,
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
      "select public.create_class_schedule($1,$2) as id",
      [token, items],
    );
    const retry = await db.query<{ id: string }>(
      "select public.create_class_schedule($1,$2) as id",
      [token, items],
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
      db.query("select public.create_class_schedule($1,$2)", [
        failToken,
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
    await expect(
      db.query("select public.save_and_submit_report($1,$2,'[]',false)", [
        reportId,
        old,
      ]),
    ).rejects.toMatchObject({ code: "PT409" });
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
      db.query("select public.manage_member($1,'coach','pending')", [ids.coach]),
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
  it("prevents administrators from deleting another author's photos", async () => {
    await asUser(ids.admin);
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
    expect(
      (
        await db.query(
          "select id from public.report_attachments where id=$1",
          [photoId],
        )
      ).rows,
    ).toHaveLength(1);
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
    await db.query("update public.export_jobs set storage_path=null where id=$1", [
      inserted.rows[0].id,
    ]);
    expect(
      (
        await db.query<{ storage_path: string | null }>(
          "select storage_path from public.export_jobs where id=$1",
          [inserted.rows[0].id],
        )
      ).rows[0].storage_path,
    ).toBeNull();

    await db.exec("reset role");
    await db.query("delete from public.export_jobs where id=$1", [inserted.rows[0].id]);
  });
});
