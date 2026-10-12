// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { beforeAll, afterAll, it, expect } from "vitest";
let db: PGlite;
const admin = "10000000-0000-4000-8000-000000000001",
  recipient = "10000000-0000-4000-8000-000000000002",
  stranger = "10000000-0000-4000-8000-000000000003",
  org = "20000000-0000-4000-8000-000000000001";
async function user(id: string) {
  await db.exec(
    `reset role;set request.jwt.claim.sub='${id}';set request.jwt.claim.role='authenticated';set role authenticated;`,
  );
}
async function invite(email = "recipient@example.com") {
  await user(admin);
  return (
    await db.query<{ id: string }>(
      "select public.create_workspace_invitation($1) id",
      [email],
    )
  ).rows[0].id;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create table auth.identities(user_id uuid,provider text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
 grant usage on schema auth,storage to authenticated;grant execute on function auth.uid() to authenticated;grant select,insert,delete on storage.objects to authenticated;`);
  for (const file of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = (await readFile("supabase/migrations/" + file, "utf8")).replace(
      "create extension if not exists pgcrypto;",
      "",
    );
    if (file.endsWith("_google_oauth_inapp_invitations.sql")) {
      await db.exec(`insert into auth.users(id,email,email_confirmed_at) values('10000000-0000-4000-8000-000000000005','legacy-pending@example.com',now()),('10000000-0000-4000-8000-000000000006','legacy-admin@example.com',now());
      insert into public.organizations(id,name) values('20000000-0000-4000-8000-000000000005','Legacy');
      insert into public.profiles(id,organization_id,name,role,status) values('10000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000005','Pending','coach','pending'),('10000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000005','Admin','admin','active');
      insert into public.workspace_memberships(user_id,organization_id,role,status) select id,organization_id,role,status from public.profiles;`);
    }
    await db.exec(sql);
  }
  await db.exec(
    `insert into auth.users(id,email,email_confirmed_at) values('${admin}','admin@example.com',now()),('${recipient}','recipient@example.com',now()),('${stranger}','stranger@example.com',now());insert into auth.identities values('${recipient}','google'),('${stranger}','google');insert into public.organizations(id,name) values('${org}','Test workspace');insert into public.profiles(id,organization_id,name,role,status) values('${admin}','${org}','Admin','admin','active');insert into public.workspace_memberships(user_id,organization_id,role,status) values('${admin}','${org}','admin','active');`,
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
it("Google-only Auth hook rejects email/missing provider and trusts app_metadata", async () => {
  await db.exec("reset role;set role supabase_auth_admin");
  expect(
    (
      await db.query<{ v: unknown }>(
        `select private.google_signup_only('{"user":{"app_metadata":{"provider":"google"}}}') v`,
      )
    ).rows[0].v,
  ).toEqual({});
  for (const event of [
    {
      user: {
        app_metadata: { provider: "email" },
        user_metadata: { provider: "google" },
      },
    },
    { user: {} },
  ])
    expect(
      (
        await db.query<{ v: { error: unknown } }>(
          "select private.google_signup_only($1) v",
          [event],
        )
      ).rows[0].v.error,
    ).toBeDefined();
});
it("invitation before registration gives no membership and is visible only to verified recipient", async () => {
  const id = await invite();
  await user(stranger);
  expect(
    (await db.query("select * from public.list_my_workspace_invitations()"))
      .rows,
  ).toHaveLength(0);
  await expect(
    db.query("select public.respond_workspace_invitation($1,true)", [id]),
  ).rejects.toThrow();
  await user(recipient);
  expect(
    (await db.query("select * from public.list_my_workspace_invitations()"))
      .rows,
  ).toHaveLength(1);
  expect(
    (
      await db.query(
        "select * from public.workspace_memberships where user_id=auth.uid()",
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (await db.query("select * from public.organizations")).rows,
  ).toHaveLength(0);
  expect(
    (await db.query("select * from public.workspace_invitations")).rows,
  ).toHaveLength(0);
});
it("acceptance creates one coach membership; retry works but cannot restore later deactivation", async () => {
  const id = await invite();
  await user(recipient);
  await db.query("select public.respond_workspace_invitation($1,true)", [id]);
  await db.query("select public.respond_workspace_invitation($1,true)", [id]);
  expect(
    (
      await db.query<{ role: string }>(
        "select role from public.workspace_memberships where user_id=auth.uid()",
      )
    ).rows,
  ).toEqual([{ role: "coach" }]);
  await db.exec(
    `reset role;update public.workspace_memberships set status='inactive' where user_id='${recipient}'`,
  );
  await user(recipient);
  await expect(
    db.query("select public.respond_workspace_invitation($1,true)", [id]),
  ).rejects.toThrow();
});
it("decline and cancellation grant no membership; administrators can reissue", async () => {
  const id = await invite("stranger@example.com");
  await user(stranger);
  await db.query("select public.respond_workspace_invitation($1,false)", [id]);
  await expect(
    db.query("select public.respond_workspace_invitation($1,true)", [id]),
  ).rejects.toThrow();
  expect(
    (
      await db.query(
        "select * from public.workspace_memberships where user_id=auth.uid()",
      )
    ).rows,
  ).toHaveLength(0);
  expect(await invite("stranger@example.com")).toBe(id);
  await db.query("select public.cancel_workspace_invitation($1)", [id]);
  await user(stranger);
  await expect(
    db.query("select public.respond_workspace_invitation($1,true)", [id]),
  ).rejects.toThrow();
});
it("expired and revoked-inviter invitations cannot be accepted", async () => {
  const id = await invite("stranger@example.com");
  await db.exec(
    `reset role;update public.workspace_invitations set expires_at=now()-interval '1 second' where id='${id}'`,
  );
  await user(stranger);
  await expect(
    db.query("select public.respond_workspace_invitation($1,true)", [id]),
  ).rejects.toThrow();
  await invite("stranger@example.com");
  await db.exec(
    `reset role;update public.workspace_memberships set status='inactive' where user_id='${admin}'`,
  );
  await user(stranger);
  expect(
    (await db.query("select * from public.list_my_workspace_invitations()"))
      .rows,
  ).toHaveLength(0);
  await expect(
    db.query("select public.respond_workspace_invitation($1,true)", [id]),
  ).rejects.toThrow();
  await db.exec(
    `reset role;update public.workspace_memberships set status='active' where user_id='${admin}'`,
  );
});
it("closes legacy direct-add and password activation RPCs", async () => {
  await user(admin);
  for (const sql of [
    `select public.add_existing_workspace_member('${recipient}')`,
    `select public.register_workspace_invitee('${recipient}','Injected')`,
    `select public.activate_invited_user('${recipient}')`,
  ])
    await expect(db.query(sql)).rejects.toThrow();
  await db.exec("reset role;set role service_role");
  await expect(
    db.query(`select public.activate_invited_user('${recipient}')`),
  ).rejects.toThrow();
});
it("new profile requires verified Google identity and ignores role/organization injection", async () => {
  const id = "10000000-0000-4000-8000-000000000004";
  await db.exec(
    `reset role;insert into auth.users(id,email,raw_user_meta_data) values('${id}','new@example.com','{"role":"admin","organization_id":"${org}"}')`,
  );
  await user(id);
  await expect(db.query("select public.ensure_my_profile()")).rejects.toThrow();
  await db.exec(
    `reset role;update auth.users set email_confirmed_at=now() where id='${id}'`,
  );
  await user(id);
  await expect(db.query("select public.ensure_my_profile()")).rejects.toThrow();
  await db.exec(
    `reset role;insert into auth.identities values('${id}','google')`,
  );
  await user(id);
  const p = (
    await db.query<{ role: string; organization_id: null }>(
      "select (public.ensure_my_profile()).*",
    )
  ).rows[0];
  expect(p.role).toBe("coach");
  expect(p.organization_id).toBeNull();
  const own = (
    await db.query<{ id: string }>(
      "select public.create_workspace('My workspace') id",
    )
  ).rows[0].id;
  expect(own).not.toBe(org);
  await expect(
    db.query("select public.switch_workspace($1)", [org]),
  ).rejects.toThrow();
});

it("migrates legacy pending members without granting access and preserves active memberships", async () => {
 await user("10000000-0000-4000-8000-000000000005");
 expect((await db.query("select * from public.workspace_memberships where user_id=auth.uid()")).rows).toHaveLength(0);
 const row=(await db.query<{id:string}>("select * from public.list_my_workspace_invitations()")).rows[0];expect(row).toBeDefined();
 await db.query("select public.respond_workspace_invitation($1,true)",[row.id]);
 expect((await db.query<{role:string}>("select role from public.workspace_memberships where user_id=auth.uid()")).rows).toEqual([{role:"coach"}]);
 await user("10000000-0000-4000-8000-000000000006");expect((await db.query<{role:string}>("select role from public.workspace_memberships where user_id=auth.uid()")).rows).toEqual([{role:"admin"}]);
});
it("anonymous callers cannot execute inbox or the protected signup hook", async () => {
 await db.exec("reset role;set role anon");
 await expect(db.query("select * from public.list_my_workspace_invitations()")).rejects.toThrow();
 await expect(db.query("select private.google_signup_only('{}')")).rejects.toThrow();
});
