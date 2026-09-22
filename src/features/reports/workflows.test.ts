// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const ids = {
  admin: "10000000-0000-4000-8000-000000000001",
  coach: "10000000-0000-4000-8000-000000000002",
  other: "10000000-0000-4000-8000-000000000003",
  org: "20000000-0000-4000-8000-000000000001",
  otherOrg: "20000000-0000-4000-8000-000000000002",
  session: "30000000-0000-4000-8000-000000000001",
};
let db: PGlite, templateId: string, reportId: string, fieldId: string;
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
      create table auth.users(id uuid primary key);
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
    ]) {
      let sql = await readFile("supabase/migrations/" + file, "utf8");
      sql = sql.replace("create extension if not exists pgcrypto;", "");
      await db.exec(sql);
    }
    await db.exec(
      `insert into auth.users values('${ids.admin}'),('${ids.coach}'),('${ids.other}');insert into public.organizations(id,name) values('${ids.org}','기관 A'),('${ids.otherOrg}','기관 B');insert into public.profiles(id,organization_id,name,role) values('${ids.admin}','${ids.org}','관리자','admin'),('${ids.coach}','${ids.org}','코치','coach'),('${ids.other}','${ids.otherOrg}','다른 기관','admin');insert into public.class_sessions(id,organization_id,title,location,start_at,end_at,created_by,updated_by) values('${ids.session}','${ids.org}','수업','서울','2026-09-22 10:00+09','2026-09-22 11:00+09','${ids.coach}','${ids.coach}');`,
    );
  }, 30000);
  afterAll(async () => {
    await db?.close();
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
    await expect(db.query("update public.template_fields set label='수정' where id=$1",[fieldId])).rejects.toThrow();
    expect(
      (
        await db.query<{ label: string }>(
          "select label from public.template_fields where id=$1",
          [fieldId],
        )
      ).rows[0].label,
    ).toBe("내용");
  });
  it("renames a template without changing its version or fields", async()=>{
    await asUser(ids.coach);
    await expect(db.query("select public.rename_template($1,'기본 양식')",[templateId])).rejects.toThrow();
    await asUser(ids.admin);
    await db.query("select public.rename_template($1,'기본 양식')",[templateId]);
    const result=await db.query<{name:string;version:number}>("select name,version from public.template_versions where id=$1",[templateId]);
    expect(result.rows[0]).toEqual({name:"기본 양식",version:1});
    expect((await db.query("select id from public.template_fields where id=$1",[fieldId])).rows).toHaveLength(1);
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
  it("confirms submissions and resets confirmation on edits, rejecting stale saves", async () => {
    await asUser(ids.admin);
    await db.query("select public.confirm_report_version($1,$2)", [
      reportId,
      await version(),
    ]);
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
    await expect(
      db.query("select public.save_and_submit_report($1,$2,'[]',false)", [
        reportId,
        old,
      ]),
    ).rejects.toThrow();
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
    await db.query(insert, [ids.org, reportId, photo, file]);
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
  it("rejects submission for a cancelled class", async () => {
    await asUser(ids.coach);
    await db.query("select public.cancel_class_session($1)", [ids.session]);
    await expect(
      db.query("select public.save_and_submit_report($1,$2,$3,true)", [
        reportId,
        await version(),
        JSON.stringify([{ fieldId, value: "수업 완료" }]),
      ]),
    ).rejects.toThrow();
  });
  it("isolates another coach's reports and private photos in the same organization", async()=>{
    const second="10000000-0000-4000-8000-000000000004";
    await db.exec(`reset role;insert into auth.users values('${second}');insert into public.profiles(id,organization_id,name) values('${second}','${ids.org}','다른 코치');`);
    await asUser(second);
    expect((await db.query("select id from public.reports where id=$1",[reportId])).rows).toHaveLength(0);
    expect((await db.query("select name from storage.objects where bucket_id='report-images'")).rows).toHaveLength(0);
    await expect(db.query("select public.confirm_report_version($1,now())",[reportId])).rejects.toThrow();
    await expect(db.query("select public.save_and_submit_report($1,now(),'[]',false)",[reportId])).rejects.toThrow();
  });
  it("archives older templates without changing existing report versions",async()=>{
    await asUser(ids.admin);
    const next=await db.query<{id:string}>("select public.save_template(null,null,$1,true) as id",[JSON.stringify([{label:"새 질문",help_text:"",field_type:"number",required:false}])]);
    expect(next.rows[0].id).not.toBe(templateId);
    expect((await db.query<{status:string}>("select status from public.template_versions where id=$1",[templateId])).rows[0].status).toBe("archived");
    expect((await db.query<{template_version_id:string}>("select template_version_id from public.reports where id=$1",[reportId])).rows[0].template_version_id).toBe(templateId);
  });
  it("isolates export history and storage from coaches and other organizations",async()=>{
    await asUser(ids.admin);
    await db.query("insert into public.export_jobs(organization_id,requested_by,format) values($1,$2,'pdf')",[ids.org,ids.admin]);
    await db.query("insert into storage.objects(bucket_id,name) values('report-exports',$1)",[`${ids.org}/${ids.admin}/report.pdf`]);
    await asUser(ids.coach);expect((await db.query("select id from public.export_jobs")).rows).toHaveLength(0);expect((await db.query("select name from storage.objects where bucket_id='report-exports'")).rows).toHaveLength(0);
    await expect(db.query("insert into public.export_jobs(organization_id,requested_by,format) values($1,$2,'pdf')",[ids.org,ids.coach])).rejects.toThrow();
    await asUser(ids.other);expect((await db.query("select id from public.export_jobs")).rows).toHaveLength(0);
  });
});
