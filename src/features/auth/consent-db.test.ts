// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { beforeAll, afterAll, it, expect } from "vitest";
let db: PGlite;
const legacy = "10000000-0000-4000-8000-000000000001",
  fresh = "10000000-0000-4000-8000-000000000002",
  other = "10000000-0000-4000-8000-000000000003";
async function user(id: string) {
  await db.exec(
    `reset role;set request.jwt.claim.sub='${id}';set request.jwt.claim.role='authenticated';set role authenticated`,
  );
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
    if (file.endsWith("_signup_required_consent.sql"))
      await db.exec(
        `insert into auth.users(id,email,email_confirmed_at) values('${legacy}','legacy@fixture.test',now())`,
      );
    await db.exec(
      (await readFile("supabase/migrations/" + file, "utf8")).replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
  }
  await db.exec(
    `insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values('${fresh}','new@fixture.test',now(),'{"consent":true}'),('${other}','other@fixture.test',now(),'{}');insert into auth.identities values('${fresh}','google'),('${other}','google');`,
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
it("preserves legacy access without fabricating a consent record", async () => {
  await user(legacy);
  expect(
    (await db.query<{ ok: boolean }>("select public.has_signup_consent() ok"))
      .rows[0].ok,
  ).toBe(true);
  expect(
    (await db.query("select * from public.signup_consents")).rows,
  ).toHaveLength(0);
});
it("blocks profile and workspace creation before consent despite editable metadata", async () => {
  await user(fresh);
  expect(
    (await db.query<{ ok: boolean }>("select public.has_signup_consent() ok"))
      .rows[0].ok,
  ).toBe(false);
  await expect(db.query("select public.ensure_my_profile()")).rejects.toThrow(
    "Signup consent required",
  );
  await expect(
    db.query("select public.create_workspace('Blocked workspace')"),
  ).rejects.toThrow("Signup consent required");
});
it("blocks accepting an invitation before consent without granting membership", async () => {
  await db.exec(`reset role;insert into public.organizations(id,name) values('20000000-0000-4000-8000-000000000001','Invitation test');
 insert into public.profiles(id,organization_id,name,role,status) values('${legacy}','20000000-0000-4000-8000-000000000001','Existing admin','admin','active');
 insert into public.workspace_memberships(user_id,organization_id,role,status) values('${legacy}','20000000-0000-4000-8000-000000000001','admin','active');
 insert into public.workspace_invitations(id,organization_id,email,invited_by) values('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','new@fixture.test','${legacy}');`);
  await user(fresh);
  await expect(
    db.query(
      "select public.respond_workspace_invitation('30000000-0000-4000-8000-000000000001',true)",
    ),
  ).rejects.toThrow("Signup consent required");
  expect(
    (
      await db.query(
        "select * from public.workspace_memberships where user_id=auth.uid()",
      )
    ).rows,
  ).toHaveLength(0);
});
it("rejects omitted consent, unknown version and unpublished documents", async () => {
  await user(fresh);
  for (const args of [
    [true, false],
    [null, true],
    [false, true],
  ])
    await expect(
      db.query(
        "select public.accept_signup_consents('2026-10-12',$1,$2)",
        args,
      ),
    ).rejects.toThrow();
  await expect(
    db.query("select public.accept_signup_consents('old',true,true)"),
  ).rejects.toThrow("Policy unavailable");
  await db.exec(
    "reset role;update private.signup_policy_versions set published=false",
  );
  await user(fresh);
  await expect(
    db.query("select public.accept_signup_consents('2026-10-12',true,true)"),
  ).rejects.toThrow("Policy unavailable");
  await db.exec(
    "reset role;update private.signup_policy_versions set published=true",
  );
});
it("cannot forge a record or an exemption directly", async () => {
  await user(fresh);
  await expect(
    db.query(
      `insert into public.signup_consents(user_id,policy_version) values('${fresh}','2026-10-12')`,
    ),
  ).rejects.toThrow();
  await expect(
    db.query(`insert into private.signup_existing_accounts values('${fresh}')`),
  ).rejects.toThrow();
  await expect(
    db.query("update private.signup_policy_versions set published=true"),
  ).rejects.toThrow();
});
it("records only the caller and server timestamp once; isolates other users and allows onboarding", async () => {
  await user(fresh);
  await db.query(
    "select public.accept_signup_consents('2026-10-12',true,true)",
  );
  const first = (
    await db.query<{
      user_id: string;
      policy_version: string;
      accepted_at: Date;
    }>("select * from public.signup_consents")
  ).rows;
  expect(first).toHaveLength(1);
  expect(first[0]).toMatchObject({
    user_id: fresh,
    policy_version: "2026-10-12",
  });
  expect(first[0].accepted_at).toBeTruthy();
  await db.query(
    "select public.accept_signup_consents('2026-10-12',true,true)",
  );
  expect((await db.query("select * from public.signup_consents")).rows).toEqual(
    first,
  );
  await db.query("select public.create_workspace('Allowed workspace')");
  await user(other);
  expect(
    (await db.query("select * from public.signup_consents")).rows,
  ).toHaveLength(0);
  expect(
    (await db.query<{ ok: boolean }>("select public.has_signup_consent() ok"))
      .rows[0].ok,
  ).toBe(false);
});
it("requires a verified Google account, rejects anonymous and subjectless calls", async () => {
  await user("");
  await expect(
    db.query("select public.accept_signup_consents('2026-10-12',true,true)"),
  ).rejects.toThrow("Verified account");
  await user(legacy);
  await expect(
    db.query("select public.accept_signup_consents('2026-10-12',true,true)"),
  ).rejects.toThrow("Google registration");
  await db.exec(
    `reset role;update auth.users set email_confirmed_at=null where id='${other}'`,
  );
  await user(other);
  await expect(
    db.query("select public.accept_signup_consents('2026-10-12',true,true)"),
  ).rejects.toThrow("Verified account");
  await db.exec("reset role;set role anon");
  await expect(
    db.query("select public.accept_signup_consents('2026-10-12',true,true)"),
  ).rejects.toThrow();
});
