// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { beforeAll, afterAll, it, expect } from "vitest";

let db: PGlite;
const uid = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const master = uid(5);
const admin = uid(1),
  coach = uid(2),
  peer = uid(3),
  outsider = uid(4);
let org: string,
  otherOrg: string,
  report: string,
  adminReport: string,
  template: string,
  field: string,
  photo: string,
  attachment: string,
  path: string;
async function user(id: string) {
  await db.exec(
    `reset role;set request.jwt.claim.sub='${id}';set request.jwt.claim.role='authenticated';set role authenticated`,
  );
}
async function version() {
  return (
    await db.query<{ v: string }>(
      "select updated_at::text v from public.reports where id=$1",
      [report],
    )
  ).rows[0].v;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;create schema auth;create schema storage;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz default now(),last_sign_in_at timestamptz,raw_user_meta_data jsonb default '{}');
    create table auth.identities(user_id uuid,provider text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
    grant usage on schema auth,storage to authenticated;
    grant select,insert,delete on storage.objects to authenticated;`);
  for (const file of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (file.endsWith("_signup_required_consent.sql")) {
      for (const id of [master, admin, coach, peer, outsider])
        await db.query(
          "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
          [id, id === master ? "davin990812@gmail.com" : `${id}@example.test`],
        );
    }
    await db.exec(
      (await readFile("supabase/migrations/" + file, "utf8")).replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
  }
  await db.exec(
    "insert into auth.identities select id,'google' from auth.users",
  );
  await db.query(
    "insert into public.profiles(id,name,role,status) values($1,'Master','coach','inactive')",
    [master],
  );
  await user(admin);
  org = (
    await db.query<{ id: string }>(
      "select public.create_workspace('Reading A') id",
    )
  ).rows[0].id;
  await user(outsider);
  otherOrg = (
    await db.query<{ id: string }>(
      "select public.create_workspace('Reading B') id",
    )
  ).rows[0].id;
  await db.exec("reset role");
  for (const id of [coach, peer]) {
    await db.query(
      "insert into public.profiles(id,organization_id,name,role,status) values($1,$2,$3,'coach','active')",
      [id, org, id === coach ? "Author" : "Reader"],
    );
  }
  await db.query(
    "insert into public.workspace_memberships(user_id,organization_id,role,status) values($1,$3,'coach','active'),($2,$3,'coach','active')",
    [coach, peer, org],
  );
  // Build fixture under postgres; all assertions below run as authenticated.
  const course = (
    await db.query<{ id: string }>(
      "insert into public.courses(organization_id,title,location,created_by,updated_by) values($1,'Class','Place',$2,$2) returning id",
      [org, admin],
    )
  ).rows[0].id;
  const session = (
    await db.query<{ id: string }>(
      "insert into public.class_sessions(organization_id,course_id,title,location,start_at,end_at,created_by,updated_by) values($1,$2,'Class','Place',now()+interval '1 day',now()+interval '2 days',$3,$3) returning id",
      [org, course, admin],
    )
  ).rows[0].id;
  await user(coach);
  const created = (
    await db.query<{ id: string; template_version_id: string }>(
      "select * from public.get_or_create_report($1)",
      [session],
    )
  ).rows[0];
  report = created.id;
  template = created.template_version_id;
  field = (
    await db.query<{ id: string }>(
      "select id from public.template_fields where template_version_id=$1 and field_type='long_text' order by sort_order limit 1",
      [template],
    )
  ).rows[0].id;
  photo = (
    await db.query<{ id: string }>(
      "select id from public.template_fields where template_version_id=$1 and field_type='photo'",
      [template],
    )
  ).rows[0].id;
  await db.query("select public.save_and_submit_report($1,$2,$3,false)", [
    report,
    await version(),
    JSON.stringify([{ fieldId: field, value: "Shared answer" }]),
  ]);
  path = `${org}/${report}/${uid(100)}.jpg`;
  await db.query(
    "insert into storage.objects(bucket_id,name) values('report-images',$1)",
    [path],
  );
  const changed = (
    await db.query<{ result: { attachment: { id: string } } }>(
      "select public.mutate_report_photo($1,$2,'insert',$3) result",
      [
        report,
        await version(),
        JSON.stringify({ field_id: photo, storage_path: path, file_size: 123 }),
      ],
    )
  ).rows[0].result;
  attachment = changed.attachment.id;
  await user(admin);
  adminReport = (
    await db.query<{ id: string }>(
      "select * from public.get_or_create_report($1)",
      [session],
    )
  ).rows[0].id;
  const required = (
    await db.query<{ id: string; field_type: string }>(
      "select id,field_type from public.template_fields where template_version_id=$1 and required",
      [template],
    )
  ).rows;
  const adminVersion = (
    await db.query<{ v: string }>(
      "select updated_at::text v from public.reports where id=$1",
      [adminReport],
    )
  ).rows[0].v;
  await db.query("select public.save_and_submit_report($1,$2,$3,true)", [
    adminReport,
    adminVersion,
    JSON.stringify(
      required.map((f) => ({
        fieldId: f.id,
        value: f.field_type === "number" ? 3 : "Example",
      })),
    ),
  ]);
}, 30000);
afterAll(async () => {
  await db?.close();
});

async function rpc<T = Record<string, unknown>>(
  sql: string,
  args: unknown[] = [],
) {
  return (await db.query<{ value: T }>(`select ${sql} value`, args)).rows[0]
    .value;
}
it("pins only the verified target account, ignoring editable role/email metadata", async () => {
  await user(master);
  expect(await rpc("public.is_service_master()")).toBe(true);
  for (const id of [admin, coach, outsider, ""]) {
    await user(id);
    expect(await rpc("public.is_service_master()")).toBe(false);
    for (const sql of [
      "public.master_users()",
      "private.master_users('',1)",
      "public.master_workspaces()",
      "public.master_workspace($1)",
      "public.master_report($1,$2)",
    ]) {
      await expect(
        rpc(
          sql,
          sql.includes("$2") ? [org, report] : sql.includes("$1") ? [org] : [],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    }
  }
  await db.exec("reset role");
  await db.query("update auth.users set raw_user_meta_data=$1 where id=$2", [
    JSON.stringify({ role: "master", email: "davin990812@gmail.com" }),
    coach,
  ]);
  await user(coach);
  expect(await rpc("public.is_service_master()")).toBe(false);
  await expect(
    db.query("select * from private.service_master"),
  ).rejects.toThrow();
  await expect(
    db.query("insert into private.service_master(user_id) values($1)", [coach]),
  ).rejects.toThrow();
  await db.exec("reset role;set role anon");
  for (const sql of [
    "public.is_service_master()",
    "public.master_users()",
    "public.master_workspaces()",
    "public.master_workspace($1)",
    "public.master_report($1,$2)",
  ]) {
    await expect(
      rpc(
        sql,
        sql.includes("$2") ? [org, report] : sql.includes("$1") ? [org] : [],
      ),
    ).rejects.toThrow();
  }
});
it("shows bounded user lists including profile-less accounts and honest consent states", async () => {
  await db.exec("reset role");
  for (let n = 20; n < 43; n++)
    await db.query(
      "insert into auth.users(id,email,created_at) values($1,$2,now()-interval '20 days')",
      [uid(n), `search${n}@example.test`],
    );
  await db.query(
    "insert into public.signup_consents(user_id,policy_version) values($1,'2026-10-12')",
    [uid(20)],
  );
  await user(master);
  type D = {
    total: number;
    stats: { total: number; recent: number; without_workspace: number };
    items: {
      id: string;
      consent: string;
      name: string | null;
      memberships: unknown[];
    }[];
  };
  const all = await rpc<D>("public.master_users()");
  expect(all.total).toBe(28);
  expect(all.items).toHaveLength(20);
  expect(all.stats).toEqual({ total: 28, recent: 5, without_workspace: 24 });
  expect(all.items.find((u) => u.id === master)?.consent).toBe("legacy_exempt");
  const filtered = await rpc<D>("public.master_users('SEARCH',2)");
  expect(filtered.total).toBe(23);
  expect(filtered.items).toHaveLength(3);
  expect(
    (await rpc<D>("public.master_users('search20',1)")).items[0],
  ).toMatchObject({ consent: "accepted", name: null });
  expect(
    (await rpc<D>("public.master_users('search21',1)")).items[0].consent,
  ).toBe("pending");
  expect((await rpc<D>("public.master_users('%',1)")).total).toBe(0);
  expect((await rpc<D>("public.master_users('',999)")).total).toBe(28);
  for (const args of [
    ["", 0],
    ["", 100001],
    ["x".repeat(101), 1],
    [null, 1],
    ["", null],
  ])
    await expect(rpc("public.master_users($1,$2)", args)).rejects.toMatchObject(
      { code: "22023" },
    );
  expect(JSON.stringify(all)).not.toMatch(
    /raw_user_meta_data|encrypted_password|token|identities/,
  );
});
it("reads all workspaces and report contents/photos without membership or changing selection", async () => {
  await user(master);
  expect(await rpc("public.current_organization_id()")).toBe(null);
  expect(await rpc("public.is_admin()")).not.toBe(true);
  const list = await rpc<{ items: { id: string }[] }>(
    "public.master_workspaces()",
  );
  expect(list.items.map((w) => w.id).sort()).toEqual([org, otherOrg].sort());
  for (const section of [
    "courses",
    "sessions",
    "reports",
    "members",
    "templates",
  ]) {
    const detail = await rpc<{
      workspace: { id: string };
      total: number;
      items: unknown[];
    }>("public.master_workspace($1,$2,1)", [org, section]);
    expect(detail.workspace.id).toBe(org);
    expect(detail.total).toBeGreaterThan(0);
    expect(detail.items.length).toBeGreaterThan(0);
  }
  const detail = await rpc<{
    report: { report_answers: unknown[]; report_attachments: unknown[] };
    fields: unknown[];
  }>("public.master_report($1,$2)", [org, report]);
  expect(detail.report.report_answers).toEqual([
    { field_id: field, value: "Shared answer" },
  ]);
  expect(detail.report.report_attachments).toHaveLength(1);
  expect(detail.fields.length).toBe(5);
  expect(await rpc("public.master_report($1,$2)", [otherOrg, report])).toBe(
    null,
  );
  expect(
    (await db.query("select name from storage.objects where name=$1", [path]))
      .rows,
  ).toHaveLength(1);
  expect(await rpc("private.master_can_read_photo('unattached.jpg')")).toBe(
    false,
  );
  expect(await rpc("public.current_organization_id()")).toBe(null);
  expect(
    (
      await db.query(
        "select * from public.workspace_memberships where user_id=$1",
        [master],
      )
    ).rows,
  ).toHaveLength(0);
});
it("does not grant workspace switches or mutations through RPC, tables or Storage", async () => {
  await user(master);
  for (const [sql, args] of [
    ["public.switch_workspace($1)", [org]],
    ["public.rename_workspace($1,'Changed','Reading A')", [org]],
    ["public.delete_workspace($1,'Reading A')", [org]],
    ["public.remove_workspace_participant($1,$2)", [org, coach]],
    ["public.manage_workspace_member($1,$2,'admin','active')", [org, coach]],
    ["public.invite_workspace_coach($1,'new@example.test')", [org]],
    ["public.save_report_draft($1,'[]')", [report]],
    [
      "public.mutate_report_photo($1,now(),'delete',$2)",
      [report, JSON.stringify({ id: attachment })],
    ],
  ] as [string, unknown[]][])
    await expect(rpc(sql, args)).rejects.toThrow();
  await expect(
    db.query("update public.reports set status='submitted' where id=$1", [
      adminReport,
    ]),
  ).rejects.toThrow();
  expect(
    (
      await db.query(
        "delete from storage.objects where name=$1 returning name",
        [path],
      )
    ).rows,
  ).toHaveLength(0);
  await expect(
    db.query(
      "insert into storage.objects(bucket_id,name) values('report-images',$1)",
      [`${org}/${report}/${uid(200)}.jpg`],
    ),
  ).rejects.toThrow();
  expect(
    (
      await db.query(
        "delete from public.report_attachments where id=$1 returning id",
        [attachment],
      )
    ).rows,
  ).toHaveLength(0);
  await db.exec("reset role");
  expect(
    (await db.query("select name from public.organizations where id=$1", [org]))
      .rows[0],
  ).toEqual({ name: "Reading A" });
});
it("does not transfer master to another account when email changes or verification is removed", async () => {
  await db.exec("reset role");
  await db.query(
    "update auth.users set email='changed@example.test' where id=$1",
    [master],
  );
  await db.query(
    "update auth.users set email='davin990812@gmail.com' where id=$1",
    [coach],
  );
  for (const id of [master, coach]) {
    await user(id);
    expect(await rpc("public.is_service_master()")).toBe(false);
  }
  await db.exec("reset role");
  await db.query(
    "update auth.users set email='davin990812@gmail.com',email_confirmed_at=null where id=$1",
    [master],
  );
  await user(master);
  expect(await rpc("public.is_service_master()")).toBe(false);
  await expect(rpc("public.master_users()")).rejects.toMatchObject({
    code: "42501",
  });
  await db.exec("reset role");
  await db.query("update auth.users set email_confirmed_at=now() where id=$1", [
    master,
  ]);
  await db.query(
    "update auth.users set email='coach@example.test' where id=$1",
    [coach],
  );
});
it("hides removed participants and deleted workspaces, reports and photos", async () => {
  await db.exec("reset role");
  await db.query(
    "update public.workspace_memberships set status='removed' where user_id=$1",
    [peer],
  );
  await user(master);
  const members = await rpc<{ items: { id: string }[] }>(
    "public.master_workspace($1,'members',1)",
    [org],
  );
  expect(members.items.map((m) => m.id)).not.toContain(peer);
  await user(admin);
  await db.query("select public.delete_workspace($1,'Reading A')", [org]);
  await user(master);
  expect(await rpc("public.master_workspace($1)", [org])).toBe(null);
  expect(await rpc("public.master_report($1,$2)", [org, report])).toBe(null);
  expect(
    (
      await rpc<{ items: { id: string }[] }>("public.master_workspaces()")
    ).items.map((w) => w.id),
  ).toEqual([otherOrg]);
  expect(
    (await db.query("select name from storage.objects where name=$1", [path]))
      .rows,
  ).toHaveLength(0);
});
