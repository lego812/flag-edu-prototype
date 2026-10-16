// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { beforeAll, afterAll, it, expect } from "vitest";

let db: PGlite;
const uid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = uid(1), coach = uid(2), peer = uid(3), outsider = uid(4);
let org: string, otherOrg: string, report: string, adminReport: string, template: string, field: string, photo: string, attachment: string, path: string;
async function user(id: string) {
  await db.exec(`reset role;set request.jwt.claim.sub='${id}';set request.jwt.claim.role='authenticated';set role authenticated`);
}
async function version() {
  return (await db.query<{ v: string }>("select updated_at::text v from public.reports where id=$1", [report])).rows[0].v;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;create schema auth;create schema storage;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create table auth.identities(user_id uuid,provider text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
    grant usage on schema auth,storage to authenticated;
    grant select,insert,delete on storage.objects to authenticated;`);
  for (const file of (await readdir("supabase/migrations")).filter(f => f.endsWith(".sql")).sort()) {
    if (file.endsWith("_signup_required_consent.sql")) {
      for (const id of [admin, coach, peer, outsider]) await db.query(
        "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [id, `${id}@example.test`]);
    }
    await db.exec((await readFile("supabase/migrations/" + file, "utf8")).replace("create extension if not exists pgcrypto;", ""));
  }
  await db.exec("insert into auth.identities select id,'google' from auth.users");
  await user(admin);
  org = (await db.query<{ id: string }>("select public.create_workspace('Reading A') id")).rows[0].id;
  await user(outsider);
  otherOrg = (await db.query<{ id: string }>("select public.create_workspace('Reading B') id")).rows[0].id;
  await db.exec("reset role");
  for (const id of [coach, peer]) {
    await db.query("insert into public.profiles(id,organization_id,name,role,status) values($1,$2,$3,'coach','active')", [id, org, id === coach ? "Author" : "Reader"]);
  }
  await db.query("insert into public.workspace_memberships(user_id,organization_id,role,status) values($1,$3,'coach','active'),($2,$3,'coach','active')", [coach, peer, org]);
  // Build fixture under postgres; all assertions below run as authenticated.
  const course = (await db.query<{ id: string }>("insert into public.courses(organization_id,title,location,created_by,updated_by) values($1,'Class','Place',$2,$2) returning id", [org, admin])).rows[0].id;
  const session = (await db.query<{ id: string }>("insert into public.class_sessions(organization_id,course_id,title,location,start_at,end_at,created_by,updated_by) values($1,$2,'Class','Place',now()+interval '1 day',now()+interval '2 days',$3,$3) returning id", [org, course, admin])).rows[0].id;
  await user(coach);
  const created = (await db.query<{ id: string; template_version_id: string }>("select * from public.get_or_create_report($1)", [session])).rows[0];
  report = created.id; template = created.template_version_id;
  field = (await db.query<{ id: string }>("select id from public.template_fields where template_version_id=$1 and field_type='long_text' order by sort_order limit 1", [template])).rows[0].id;
  photo = (await db.query<{ id: string }>("select id from public.template_fields where template_version_id=$1 and field_type='photo'", [template])).rows[0].id;
  await db.query("select public.save_and_submit_report($1,$2,$3,false)", [report, await version(), JSON.stringify([{ fieldId: field, value: "Shared answer" }])]);
  path = `${org}/${report}/${uid(100)}.jpg`;
  await db.query("insert into storage.objects(bucket_id,name) values('report-images',$1)", [path]);
  const changed = (await db.query<{ result: { attachment: { id: string } } }>("select public.mutate_report_photo($1,$2,'insert',$3) result", [report, await version(), JSON.stringify({ field_id: photo, storage_path: path, file_size: 123 })])).rows[0].result;
  attachment = changed.attachment.id;
  await user(admin);
  adminReport = (await db.query<{ id: string }>("select * from public.get_or_create_report($1)", [session])).rows[0].id;
  const required = (await db.query<{ id: string; field_type: string }>("select id,field_type from public.template_fields where template_version_id=$1 and required", [template])).rows;
  const adminVersion = (await db.query<{ v: string }>("select updated_at::text v from public.reports where id=$1", [adminReport])).rows[0].v;
  await db.query("select public.save_and_submit_report($1,$2,$3,true)", [adminReport, adminVersion, JSON.stringify(required.map(f => ({ fieldId: f.id, value: f.field_type === "number" ? 3 : "Example" })))]);
}, 30000);
afterAll(async () => { await db?.close(); });

it("lets a peer read coach drafts/admin submissions, answers, photo objects and only author display names", async () => {
  await user(peer);
  expect((await db.query("select id from public.reports where id=any($1)", [[report, adminReport]])).rows).toHaveLength(2);
  expect((await db.query("select value from public.report_answers where report_id=$1", [report])).rows).toEqual([{ value: "Shared answer" }]);
  expect((await db.query("select id from public.report_attachments where report_id=$1", [report])).rows).toHaveLength(1);
  expect((await db.query("select name from storage.objects where name=$1", [path])).rows).toHaveLength(1);
  expect((await db.query("select * from public.list_report_authors($1)", [[coach]])).rows).toEqual([{ id: coach, name: "Author" }]);
  expect((await db.query("select * from public.profiles where id=$1", [coach])).rows).toHaveLength(0);
  expect((await db.query("select * from public.list_report_authors($1)", [[outsider]])).rows).toHaveLength(0);
});

it("denies peer answer, submission, photo and direct table/storage writes despite readable reports", async () => {
  await user(peer);
  const v = await version();
  for (const submit of [false, true]) await expect(db.query("select public.save_and_submit_report($1,$2,'[]',$3)", [report, v, submit])).rejects.toThrow();
  await expect(db.query("select public.save_report_draft($1,'[]')", [report])).rejects.toThrow();
  await expect(db.query("select public.mutate_report_photo($1,$2,'delete',$3)", [report, v, JSON.stringify({ id: attachment })])).rejects.toMatchObject({ code: "42501" });
  await expect(db.query("select public.mutate_report_photo($1,$2,'insert',$3)", [report, v, JSON.stringify({ field_id: photo, storage_path: `${org}/${report}/${uid(101)}.jpg`, file_size: 123 })])).rejects.toThrow();
  for (const table of ["reports", "report_answers"]) {
    await expect(db.query(`delete from public.${table}`)).rejects.toThrow();
  }
  await expect(db.query("update public.reports set status='submitted' where id=$1", [report])).rejects.toThrow();
  await expect(db.query("update public.report_answers set value='\"tampered\"' where report_id=$1", [report])).rejects.toThrow();
  expect((await db.query("delete from public.report_attachments where id=$1 returning id", [attachment])).rows).toHaveLength(0);
  expect((await db.query("delete from storage.objects where name=$1 returning name", [path])).rows).toHaveLength(0);
  await expect(db.query("insert into storage.objects(bucket_id,name) values('report-images',$1)", [`${org}/${report}/${uid(101)}.jpg`])).rejects.toThrow();
  expect(await version()).toBe(v);
});

it("keeps cancelled reports readable but denies their authors further changes", async () => {
  await db.exec("reset role;begin");
  try {
    await db.query("update public.class_sessions set status='cancelled' where id=(select class_session_id from public.reports where id=$1)", [report]);
    await user(peer);
    expect((await db.query("select id from public.reports where id=$1", [report])).rows).toHaveLength(1);
    expect((await db.query("select name from storage.objects where name=$1", [path])).rows).toHaveLength(1);
    await user(coach);
    // Roll back the assertion's failed transaction after checking the error.
    await expect(db.query("select public.save_and_submit_report($1,$2,'[]',false)", [report, await version()])).rejects.toMatchObject({ code: "PT409" });
  } finally { await db.exec("rollback;reset role"); }
});

it("preserves historical template fields after replacement and hiding without exposing unused drafts", async () => {
  await user(admin);
  const fields = JSON.stringify([{ label: "New", field_type: "single_select", help_text: "", required: false, options: ["One"] }]);
  const unused = (await db.query<{ id: string }>("select public.save_template(null,null,$1,false) id", [fields])).rows[0].id;
  await db.query("select public.save_template(null,null,$1,true)", [fields]);
  await db.query("select public.deactivate_template($1)", [template]);
  await user(peer);
  expect((await db.query("select id from public.template_versions where id=$1", [template])).rows).toHaveLength(1);
  expect((await db.query("select id from public.template_fields where template_version_id=$1", [template])).rows.length).toBeGreaterThan(0);
  expect((await db.query("select id from public.template_versions where id=$1", [unused])).rows).toHaveLength(0);
});

it("blocks outsiders, inactive/removed members, subjectless and anonymous callers", async () => {
  for (const id of [outsider, ""]) {
    await user(id);
    expect((await db.query("select id from public.reports where id=$1", [report])).rows).toHaveLength(0);
    expect((await db.query("select * from public.list_report_authors($1)", [[coach]])).rows).toHaveLength(0);
    expect((await db.query("select name from storage.objects where name=$1", [path])).rows).toHaveLength(0);
  }
  for (const status of ["inactive", "removed"]) {
    await db.exec("reset role");
    await db.query("update public.workspace_memberships set status=$1 where user_id=$2 and organization_id=$3", [status, peer, org]);
    await user(peer);
    expect((await db.query("select id from public.reports")).rows).toHaveLength(0);
    expect((await db.query("select * from public.list_report_authors()")).rows).toHaveLength(0);
    expect((await db.query("select report_id from public.report_answers")).rows).toHaveLength(0);
    expect((await db.query("select id from public.report_attachments")).rows).toHaveLength(0);
    expect((await db.query("select name from storage.objects")).rows).toHaveLength(0);
  }
  await db.exec("reset role;set role anon");
  await expect(db.query("select * from public.list_report_authors()")).rejects.toThrow();
});

it("keeps author/admin edits and selected-workspace isolation", async () => {
  for (const id of [coach, admin]) {
    await user(id);
    await db.query("select public.save_and_submit_report($1,$2,$3,false)", [report, await version(), JSON.stringify([{ fieldId: field, value: "Allowed" }])]);
  }
  await db.exec("reset role");
  await db.query("insert into public.workspace_memberships(organization_id,user_id,role,status) values($1,$2,'coach','active')", [otherOrg, coach]);
  await user(coach);
  await db.query("select public.switch_workspace($1)", [otherOrg]);
  expect((await db.query("select id from public.reports where id=$1", [report])).rows).toHaveLength(0);
  expect((await db.query("select * from public.list_report_authors($1)", [[admin]])).rows).toHaveLength(0);
  // The author can select B without losing their display name on A's history.
  await user(admin);
  expect((await db.query("select * from public.list_report_authors($1)", [[coach]])).rows).toEqual([{ id: coach, name: "Author" }]);
  await db.exec("reset role");
  await db.query("update public.workspace_memberships set status='removed' where user_id=$1 and organization_id=$2", [coach, org]);
  await user(admin);
  expect((await db.query("select * from public.list_report_authors($1)", [[coach]])).rows).toEqual([{ id: coach, name: "Author" }]);
});

it("hides reports, photos and author names after workspace deletion", async () => {
  await user(admin);
  await db.query("select public.delete_workspace($1,'Reading A')", [org]);
  expect((await db.query("select id from public.reports where id=$1", [report])).rows).toHaveLength(0);
  expect((await db.query("select * from public.list_report_authors()")).rows).toHaveLength(0);
  expect((await db.query("select name from storage.objects where name=$1", [path])).rows).toHaveLength(0);
});
