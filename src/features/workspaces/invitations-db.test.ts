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
    if (file.endsWith("_workspace_participation_states.sql")) {
      await db.exec(`insert into auth.users(id,email,email_confirmed_at) values('10000000-0000-4000-8000-000000000007','legacy-hidden@fixture.test',now());
      insert into public.organizations(id,name) values('20000000-0000-4000-8000-000000000007','Legacy hidden');
      insert into public.profiles(id,organization_id,name,role,status) values('10000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000007','Legacy hidden','coach','inactive');
      insert into public.workspace_memberships(user_id,organization_id,role,status) values('10000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000007','coach','inactive');`);
    }
    await db.exec(sql);
  }
  await db.exec(
    `insert into auth.users(id,email,email_confirmed_at) values('${admin}','admin@example.com',now()),('${recipient}','recipient@example.com',now()),('${stranger}','stranger@example.com',now());insert into auth.identities values('${recipient}','google'),('${stranger}','google');insert into public.organizations(id,name) values('${org}','Test workspace');insert into public.profiles(id,organization_id,name,role,status) values('${admin}','${org}','Admin','admin','active');insert into public.workspace_memberships(user_id,organization_id,role,status) values('${admin}','${org}','admin','active');`,
  );
  // These fixtures model accounts present before signup-consent rollout.
  await db.exec(
    "insert into private.signup_existing_accounts(user_id) select id from auth.users on conflict do nothing",
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
  await db.query(
    "select public.accept_signup_consents('2026-10-12',true,true)",
  );
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
  expect(
    (
      await db.query(
        "select * from public.workspace_memberships where user_id=auth.uid()",
      )
    ).rows,
  ).toHaveLength(0);
  const row = (
    await db.query<{ id: string }>(
      "select * from public.list_my_workspace_invitations()",
    )
  ).rows[0];
  expect(row).toBeDefined();
  await db.query("select public.respond_workspace_invitation($1,true)", [
    row.id,
  ]);
  expect(
    (
      await db.query<{ role: string }>(
        "select role from public.workspace_memberships where user_id=auth.uid()",
      )
    ).rows,
  ).toEqual([{ role: "coach" }]);
  await user("10000000-0000-4000-8000-000000000006");
  expect(
    (
      await db.query<{ role: string }>(
        "select role from public.workspace_memberships where user_id=auth.uid()",
      )
    ).rows,
  ).toEqual([{ role: "admin" }]);
});
it("anonymous callers cannot execute inbox or the protected signup hook", async () => {
  await db.exec("reset role;set role anon");
  await expect(
    db.query("select * from public.list_my_workspace_invitations()"),
  ).rejects.toThrow();
  await expect(
    db.query("select private.google_signup_only('{}')"),
  ).rejects.toThrow();
});

const directoryOrg = "20000000-0000-4000-8000-000000000011";
const fallbackOrg = "20000000-0000-4000-8000-000000000012";
const owner = "10000000-0000-4000-8000-000000000011";
const member = "10000000-0000-4000-8000-000000000012";
const outsider = "10000000-0000-4000-8000-000000000013";
async function rejected(run: () => Promise<unknown>, message?: string) {
  await db.exec("savepoint denied");
  try {
    await expect(run()).rejects.toThrow(message);
  } finally {
    await db.exec("rollback to savepoint denied;release savepoint denied");
  }
}
async function directoryFixture(run: () => Promise<void>) {
  await db.exec(`reset role;begin;
 insert into auth.users(id,email,email_confirmed_at) values('${owner}','owner@fixture.test',now()),('${member}','member@fixture.test',now()),('${outsider}','outsider@fixture.test',now());
 insert into public.organizations(id,name) values('${directoryOrg}','Directory'),('${fallbackOrg}','Fallback');
 insert into public.profiles(id,organization_id,name,role,status) values('${owner}','${fallbackOrg}','Owner','coach','active'),('${member}','${directoryOrg}','Member','coach','active'),('${outsider}','${fallbackOrg}','Outsider','admin','active');
 insert into public.workspace_memberships(user_id,organization_id,role,status) values('${owner}','${directoryOrg}','admin','active'),('${owner}','${fallbackOrg}','coach','active'),('${member}','${directoryOrg}','coach','active'),('${member}','${fallbackOrg}','admin','active'),('${outsider}','${fallbackOrg}','admin','active');`);
  await db.exec(
    "insert into private.signup_existing_accounts(user_id) select id from auth.users on conflict do nothing",
  );
  try {
    await run();
  } finally {
    await db.exec("rollback;reset role");
  }
}
it("directory uses target workspace roles and leaves profiles RLS narrow", async () => {
  await directoryFixture(async () => {
    await user(member);
    const rows = (
      await db.query("select * from public.list_workspace_participants($1)", [
        directoryOrg,
      ])
    ).rows;
    expect(rows).toEqual([
      { user_id: owner, name: "Owner", role: "admin", status: "active" },
      { user_id: member, name: "Member", role: "coach", status: "active" },
    ]);
    expect((await db.query("select id from public.profiles")).rows).toEqual([
      { id: member },
    ]);
    await user(outsider);
    await rejected(
      () =>
        db.query("select * from public.list_workspace_participants($1)", [
          directoryOrg,
        ]),
      "Active workspace membership required",
    );
    await db.exec("reset role;set role anon");
    await rejected(() =>
      db.query("select * from public.list_workspace_participants($1)", [
        directoryOrg,
      ]),
    );
  });
});
it("removal authorizes target admin, preserves account and other memberships, selects fallback", async () => {
  await directoryFixture(async () => {
    await user(owner);
    await db.query("select public.remove_workspace_participant($1,$2)", [
      directoryOrg,
      member,
    ]);
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select organization_id,role,status from public.workspace_memberships where user_id=$1 order by organization_id",
          [member],
        )
      ).rows,
    ).toEqual([
      { organization_id: directoryOrg, role: "coach", status: "removed" },
      { organization_id: fallbackOrg, role: "admin", status: "active" },
    ]);
    expect(
      (
        await db.query(
          "select organization_id,role,status from public.profiles where id=$1",
          [member],
        )
      ).rows,
    ).toEqual([
      { organization_id: fallbackOrg, role: "admin", status: "active" },
    ]);
    expect(
      (await db.query("select id from auth.users where id=$1", [member])).rows,
    ).toHaveLength(1);
    await user(member);
    await rejected(() =>
      db.query("select * from public.list_workspace_participants($1)", [
        directoryOrg,
      ]),
    );
    await user(owner);
    expect(
      (
        await db.query("select * from public.list_workspace_participants($1)", [
          directoryOrg,
        ])
      ).rows,
    ).toHaveLength(1);
    await rejected(
      () =>
        db.query("select public.remove_workspace_participant($1,$2)", [
          directoryOrg,
          member,
        ]),
      "Active participant not found",
    );
  });
});
it("last workspace removal preserves profile without business access", async () => {
  await directoryFixture(async () => {
    await db.exec(
      `delete from public.workspace_memberships where user_id='${member}' and organization_id='${fallbackOrg}'`,
    );
    await user(owner);
    await db.query("select public.remove_workspace_participant($1,$2)", [
      directoryOrg,
      member,
    ]);
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select organization_id,role,status from public.profiles where id=$1",
          [member],
        )
      ).rows,
    ).toEqual([{ organization_id: null, role: "coach", status: "inactive" }]);
    await user(member);
    expect(
      (await db.query("select public.current_organization_id() id")).rows,
    ).toEqual([{ id: null }]);
  });
});
it("coach, foreign admin, last administrator and anonymous removal are denied without writes", async () => {
  await directoryFixture(async () => {
    for (const actor of [member, outsider]) {
      await user(actor);
      await rejected(
        () =>
          db.query("select public.remove_workspace_participant($1,$2)", [
            directoryOrg,
            owner,
          ]),
        "Workspace administrator required",
      );
    }
    await user(owner);
    await rejected(
      () =>
        db.query("select public.remove_workspace_participant($1,$2)", [
          directoryOrg,
          owner,
        ]),
      "Last administrator must remain",
    );
    await db.exec("reset role;set role anon");
    await rejected(() =>
      db.query("select public.remove_workspace_participant($1,$2)", [
        directoryOrg,
        member,
      ]),
    );
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select * from public.workspace_memberships where organization_id=$1 and status='active'",
          [directoryOrg],
        )
      ).rows,
    ).toHaveLength(2);
  });
});

it("target administrator renames an unselected workspace without changing memberships", async () => {
  await directoryFixture(async () => {
    await user(owner);
    await db.query("select public.rename_workspace($1,$2,$3)", [
      directoryOrg,
      "  Renamed  ",
      "Directory",
    ]);
    expect(
      (
        await db.query("select name from public.organizations where id=$1", [
          directoryOrg,
        ])
      ).rows,
    ).toEqual([{ name: "Renamed" }]);
    await rejected(
      () =>
        db.query("select public.rename_workspace($1,$2,$3)", [
          directoryOrg,
          "Overwrite",
          "Directory",
        ]),
      "Workspace name changed",
    );
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select count(*)::int n from public.workspace_memberships where organization_id=$1 and status='active'",
          [directoryOrg],
        )
      ).rows,
    ).toEqual([{ n: 2 }]);
    expect(
      (
        await db.query(
          "select organization_id from public.profiles where id=$1",
          [owner],
        )
      ).rows,
    ).toEqual([{ organization_id: fallbackOrg }]);
  });
});
it("rename denies coaches, foreign administrators, inactive administrators and anonymous callers", async () => {
  await directoryFixture(async () => {
    for (const actor of [member, outsider]) {
      await user(actor);
      await rejected(
        () =>
          db.query("select public.rename_workspace($1,$2,$3)", [
            directoryOrg,
            "Injected",
            "Directory",
          ]),
        "Workspace administrator required",
      );
    }
    await db.exec(
      `reset role;update public.workspace_memberships set status='inactive' where organization_id='${directoryOrg}' and user_id='${owner}'`,
    );
    await user(owner);
    await rejected(() =>
      db.query("select public.rename_workspace($1,$2,$3)", [
        directoryOrg,
        "Injected",
        "Directory",
      ]),
    );
    await db.exec("reset role;set role anon");
    await rejected(() =>
      db.query("select public.rename_workspace($1,$2,$3)", [
        directoryOrg,
        "Injected",
        "Directory",
      ]),
    );
  });
});
it("rename validates empty and oversized names at the database boundary", async () => {
  await directoryFixture(async () => {
    await user(owner);
    for (const name of ["", " ", "a", "x".repeat(101)])
      await rejected(
        () =>
          db.query("select public.rename_workspace($1,$2,$3)", [
            directoryOrg,
            name,
            "Directory",
          ]),
        "Invalid workspace name",
      );
  });
});
it("inline invitations require the rendered workspace to remain selected", async () => {
  await directoryFixture(async () => {
    await user(owner);
    await rejected(
      () =>
        db.query("select public.invite_workspace_coach($1,$2)", [
          directoryOrg,
          "new@fixture.test",
        ]),
      "Selected workspace administrator required",
    );
    await db.query("select public.switch_workspace($1)", [directoryOrg]);
    const result = (
      await db.query<{ id: string }>(
        "select public.invite_workspace_coach($1,$2) id",
        [directoryOrg, "new@fixture.test"],
      )
    ).rows[0];
    expect(result.id).toBeTruthy();
    await user(member);
    await rejected(() =>
      db.query("select public.invite_workspace_coach($1,$2)", [
        directoryOrg,
        "other@fixture.test",
      ]),
    );
  });
});

it("coach self-leave preserves other membership and profile selection", async () => {
  await directoryFixture(async () => {
    await user(member);
    await db.query("select public.remove_workspace_participant($1,$2)", [
      directoryOrg,
      member,
    ]);
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select organization_id,role,status from public.profiles where id=$1",
          [member],
        )
      ).rows,
    ).toEqual([
      { organization_id: fallbackOrg, role: "admin", status: "active" },
    ]);
    expect(
      (
        await db.query("select count(*)::int n from auth.users where id=$1", [
          member,
        ])
      ).rows,
    ).toEqual([{ n: 1 }]);
  });
});
it("administrator can leave when another active administrator remains", async () => {
  await directoryFixture(async () => {
    await db.exec(
      `update public.workspace_memberships set role='admin' where user_id='${member}' and organization_id='${directoryOrg}'`,
    );
    await user(owner);
    await db.query("select public.remove_workspace_participant($1,$2)", [
      directoryOrg,
      owner,
    ]);
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select status from public.workspace_memberships where user_id=$1 and organization_id=$2",
          [owner, directoryOrg],
        )
      ).rows,
    ).toEqual([{ status: "removed" }]);
  });
});
it("authenticated requests without a subject cannot remove or leave another member", async () => {
  await directoryFixture(async () => {
    await user("");
    await rejected(
      () =>
        db.query("select public.remove_workspace_participant($1,$2)", [
          directoryOrg,
          member,
        ]),
      "Workspace administrator required",
    );
  });
});

it("soft deletion requires the exact current name and a target administrator", async () => {
  await directoryFixture(async () => {
    await user(owner);
    for (const name of ["directory", " Directory", "Directory ", ""])
      await rejected(
        () =>
          db.query("select public.delete_workspace($1,$2)", [
            directoryOrg,
            name,
          ]),
        "Workspace name does not match",
      );
    for (const actor of [member, outsider]) {
      await user(actor);
      await rejected(
        () =>
          db.query("select public.delete_workspace($1,$2)", [
            directoryOrg,
            "Directory",
          ]),
        "Workspace administrator required",
      );
    }
    await db.exec("reset role;set role anon");
    await rejected(() =>
      db.query("select public.delete_workspace($1,$2)", [
        directoryOrg,
        "Directory",
      ]),
    );
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select deleted_at from public.organizations where id=$1",
          [directoryOrg],
        )
      ).rows,
    ).toEqual([{ deleted_at: null }]);
  });
});
it("soft deletion hides a populated workspace but preserves courses, reports, photos, accounts and other memberships", async () => {
  await directoryFixture(async () => {
    const course = "30000000-0000-4000-8000-000000000011",
      session = "40000000-0000-4000-8000-000000000011",
      template = "50000000-0000-4000-8000-000000000011",
      field = "60000000-0000-4000-8000-000000000011",
      report = "70000000-0000-4000-8000-000000000011";
    const path = `${directoryOrg}/${report}/80000000-0000-4000-8000-000000000011.jpg`;
    await db.exec(`set request.jwt.claim.role='service_role';
   insert into public.courses(id,organization_id,title,location,created_by,updated_by) values('${course}','${directoryOrg}','Class','Room','${owner}','${owner}');
   insert into public.class_sessions(id,organization_id,course_id,title,location,start_at,end_at,created_by,updated_by) values('${session}','${directoryOrg}','${course}','Class','Room','2050-01-01 00:00:00Z','2050-01-01 01:00:00Z','${owner}','${owner}');
   insert into public.template_versions(id,organization_id,version,status,created_by,published_at) values('${template}','${directoryOrg}',1,'draft','${owner}',null);
   insert into public.template_fields(id,template_version_id,label,field_type,sort_order) values('${field}','${template}','Photo','photo',1);
   update public.template_versions set status='active',published_at=now() where id='${template}';
   insert into public.reports(id,organization_id,class_session_id,author_id,template_version_id) values('${report}','${directoryOrg}','${session}','${member}','${template}');
   insert into storage.objects(bucket_id,name) values('report-images','${path}');
   insert into public.report_attachments(organization_id,report_id,field_id,storage_path,original_filename,file_size) values('${directoryOrg}','${report}','${field}','${path}','photo.jpg',100);

   insert into public.workspace_invitations(organization_id,email,invited_by) values('${directoryOrg}','pending@fixture.test','${owner}');`);
    await user(member);
    expect(
      (await db.query("select id from public.reports where id=$1", [report]))
        .rows,
    ).toHaveLength(1);
    await user(owner);
    await db.query("select public.delete_workspace($1,$2)", [
      directoryOrg,
      "Directory",
    ]);
    expect(
      (
        await db.query("select id from public.organizations where id=$1", [
          directoryOrg,
        ])
      ).rows,
    ).toHaveLength(0);
    await user(member);
    expect(
      (await db.query("select id from public.reports where id=$1", [report]))
        .rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select name from storage.objects where name=$1", [path]))
        .rows,
    ).toHaveLength(0);
    await rejected(() =>
      db.query("select public.switch_workspace($1)", [directoryOrg]),
    );
    await db.exec("reset role");
    for (const table of [
      "courses",
      "class_sessions",
      "template_versions",
      "reports",
      "report_attachments",
    ])
      expect(
        (
          await db.query(
            `select id from public.${table} where organization_id=$1`,
            [directoryOrg],
          )
        ).rows,
      ).toHaveLength(1);
    expect(
      (await db.query("select id from storage.objects where name=$1", [path]))
        .rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select status from public.workspace_invitations where organization_id=$1",
          [directoryOrg],
        )
      ).rows,
    ).toEqual([{ status: "cancelled" }]);
    expect(
      (
        await db.query(
          "select organization_id,role,status from public.profiles where id=$1",
          [member],
        )
      ).rows,
    ).toEqual([
      { organization_id: fallbackOrg, role: "admin", status: "active" },
    ]);
    expect(
      (
        await db.query(
          "select user_id,role,status from public.workspace_memberships where organization_id=$1 order by user_id",
          [fallbackOrg],
        )
      ).rows,
    ).toEqual([
      { user_id: owner, role: "coach", status: "active" },
      { user_id: member, role: "admin", status: "active" },
      { user_id: outsider, role: "admin", status: "active" },
    ]);
    expect(
      (
        await db.query("select id from auth.users where id in ($1,$2,$3)", [
          owner,
          member,
          outsider,
        ])
      ).rows,
    ).toHaveLength(3);
  });
});
it("deletion moves participants with no other workspace to the welcome state and keeps their account", async () => {
  await directoryFixture(async () => {
    await db.query(
      "delete from public.workspace_memberships where user_id=$1 and organization_id=$2",
      [member, fallbackOrg],
    );
    await user(owner);
    await db.query("select public.delete_workspace($1,$2)", [
      directoryOrg,
      "Directory",
    ]);
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select organization_id,status from public.profiles where id=$1",
          [member],
        )
      ).rows,
    ).toEqual([{ organization_id: null, status: "inactive" }]);
    expect(
      (await db.query("select id from auth.users where id=$1", [member])).rows,
    ).toHaveLength(1);
  });
});
it("a renamed workspace cannot be deleted using the old confirmation", async () => {
  await directoryFixture(async () => {
    await user(owner);
    await db.query("select public.rename_workspace($1,$2,$3)", [
      directoryOrg,
      "New Directory",
      "Directory",
    ]);
    await rejected(
      () =>
        db.query("select public.delete_workspace($1,$2)", [
          directoryOrg,
          "Directory",
        ]),
      "Workspace name does not match",
    );
    expect(
      (
        await db.query(
          "select name,deleted_at from public.organizations where id=$1",
          [directoryOrg],
        )
      ).rows,
    ).toEqual([{ name: "New Directory", deleted_at: null }]);
  });
});
it("the deletion marker blocks archived access even if an operator reactivates a membership or old invitation", async () => {
  await directoryFixture(async () => {
    const id = "90000000-0000-4000-8000-000000000011";
    await db.exec(
      `insert into public.workspace_invitations(id,organization_id,email,invited_by) values('${id}','${directoryOrg}','stranger@example.com','${owner}')`,
    );
    await user(owner);
    await db.query("select public.delete_workspace($1,$2)", [
      directoryOrg,
      "Directory",
    ]);
    await db.exec(
      `reset role;update public.workspace_memberships set status='active' where user_id='${owner}' and organization_id='${directoryOrg}';select set_config('app.allow_workspace_switch','on',true);update public.profiles set organization_id='${directoryOrg}',role='admin',status='active' where id='${owner}';update public.workspace_invitations set status='pending' where id='${id}'`,
    );
    await user(owner);
    expect(
      (
        await db.query(
          "select public.has_active_workspace_membership($1) allowed,public.current_organization_id() organization_id,public.current_user_role() role",
          [directoryOrg],
        )
      ).rows,
    ).toEqual([{ allowed: false, organization_id: null, role: null }]);
    expect(
      (
        await db.query("select id from public.organizations where id=$1", [
          directoryOrg,
        ])
      ).rows,
    ).toHaveLength(0);
    for (const [sql, params] of [
      ["select public.switch_workspace($1)", [directoryOrg]],
      ["select * from public.list_workspace_participants($1)", [directoryOrg]],
      [
        "select public.rename_workspace($1,$2,$3)",
        [directoryOrg, "Resurrected", "Directory"],
      ],
      [
        "select public.remove_workspace_participant($1,$2)",
        [directoryOrg, owner],
      ],
      [
        "select public.invite_workspace_coach($1,$2)",
        [directoryOrg, "other@fixture.test"],
      ],
    ])
      await rejected(() => db.query(sql as string, params as string[]));
    await user(stranger);
    expect(
      (
        await db.query(
          "select * from public.list_my_workspace_invitations() where id=$1",
          [id],
        )
      ).rows,
    ).toHaveLength(0);
    await rejected(
      () =>
        db.query("select public.respond_workspace_invitation($1,true)", [id]),
      "Invitation unavailable",
    );
  });
});

it("stale member forms and legacy RPC cannot change a shared member in another workspace", async () => {
  await directoryFixture(async () => {
    await db.exec(
      `update public.workspace_memberships set role='admin' where user_id='${owner}' and organization_id='${fallbackOrg}';update public.profiles set role='admin' where id='${owner}'`,
    );
    await user(owner);
    await rejected(
      () =>
        db.query(
          "select public.manage_workspace_member($1,$2,'coach','inactive')",
          [directoryOrg, member],
        ),
      "Selected workspace administrator required",
    );
    await rejected(() =>
      db.query("select public.manage_member($1,'coach','inactive')", [member]),
    );
    expect(
      (
        await db.query(
          "select role,status from public.workspace_memberships where user_id=$1 and organization_id=$2",
          [member, fallbackOrg],
        )
      ).rows,
    ).toEqual([{ role: "admin", status: "active" }]);
  });
});
it("scoped member changes work normally and respect deletion", async () => {
  await directoryFixture(async () => {
    await user(owner);
    await db.query("select public.switch_workspace($1)", [directoryOrg]);
    await db.query(
      "select public.manage_workspace_member($1,$2,'admin','active')",
      [directoryOrg, member],
    );
    expect(
      (
        await db.query(
          "select role from public.workspace_memberships where user_id=$1 and organization_id=$2",
          [member, directoryOrg],
        )
      ).rows,
    ).toEqual([{ role: "admin" }]);
    await db.query("select public.delete_workspace($1,$2)", [
      directoryOrg,
      "Directory",
    ]);
    await rejected(() =>
      db.query(
        "select public.manage_workspace_member($1,$2,'coach','active')",
        [directoryOrg, member],
      ),
    );
  });
});

it("purges only expired tombstones after Storage cleanup, preserves accounts and blocks client purge", async () => {
  await directoryFixture(async () => {
    const course = "30000000-0000-4000-8000-000000000011",
      session = "40000000-0000-4000-8000-000000000011",
      template = "50000000-0000-4000-8000-000000000011",
      field = "60000000-0000-4000-8000-000000000011",
      report = "70000000-0000-4000-8000-000000000011";
    const path = `${directoryOrg}/${report}/80000000-0000-4000-8000-000000000011.jpg`;
    await db.exec(`set request.jwt.claim.role='service_role';
   insert into public.courses(id,organization_id,title,location,created_by,updated_by) values('${course}','${directoryOrg}','Class','Room','${owner}','${owner}');
   insert into public.class_sessions(id,organization_id,course_id,title,location,start_at,end_at,created_by,updated_by) values('${session}','${directoryOrg}','${course}','Class','Room','2050-01-01 00:00:00Z','2050-01-01 01:00:00Z','${owner}','${owner}');
   insert into public.template_versions(id,organization_id,version,status,created_by,published_at) values('${template}','${directoryOrg}',1,'draft','${owner}',null);
   insert into public.template_fields(id,template_version_id,label,field_type,sort_order) values('${field}','${template}','Photo','photo',1);
   update public.template_versions set status='active',published_at=now() where id='${template}';
   insert into public.reports(id,organization_id,class_session_id,author_id,template_version_id) values('${report}','${directoryOrg}','${session}','${member}','${template}');
   insert into storage.objects(bucket_id,name) values('report-images','${path}');
   insert into public.report_attachments(organization_id,report_id,field_id,storage_path,original_filename,file_size) values('${directoryOrg}','${report}','${field}','${path}','photo.jpg',100);

   insert into public.workspace_invitations(organization_id,email,invited_by) values('${directoryOrg}','pending@fixture.test','${owner}');`);

    await db.exec(`update public.class_sessions set status='cancelled' where id='${session}';
      insert into public.export_jobs(organization_id,requested_by,format,status,storage_path) values('${directoryOrg}','${owner}','pdf','completed','${directoryOrg}/old/export.pdf');
      insert into storage.objects(bucket_id,name) values('report-images','${directoryOrg}/orphan/photo.jpg'),('report-exports','${directoryOrg}/old/export.pdf'),('report-images','${fallbackOrg}/keep/photo.jpg');`);
    await user(owner);
    for (const fn of [
      "list_workspaces_due_for_purge()",
      "begin_workspace_purge($1)",
      "list_workspace_purge_objects($1)",
      "finish_workspace_purge($1)",
    ]) {
      await rejected(() =>
        db.query(
          "select public." + fn,
          fn.includes("$1") ? [directoryOrg] : [],
        ),
      );
    }
    await db.query("select public.delete_workspace($1,'Directory')", [
      directoryOrg,
    ]);
    await db.exec(
      "reset role;set request.jwt.claim.role='service_role';set role service_role",
    );
    expect(
      (
        await db.query<{ ok: boolean }>(
          "select public.begin_workspace_purge($1) ok",
          [directoryOrg],
        )
      ).rows[0].ok,
    ).toBe(false);
    expect(
      (
        await db.query<{ ok: boolean }>(
          "select public.begin_workspace_purge($1) ok",
          [fallbackOrg],
        )
      ).rows[0].ok,
    ).toBe(false);
    await db.exec(
      `reset role;update public.organizations set deleted_at=now()-interval '30 days' where id='${directoryOrg}';set role service_role`,
    );
    expect(
      (await db.query("select * from public.list_workspaces_due_for_purge()"))
        .rows,
    ).toEqual([{ id: directoryOrg }]);
    expect(
      (
        await db.query<{ ok: boolean }>(
          "select public.begin_workspace_purge($1) ok",
          [directoryOrg],
        )
      ).rows[0].ok,
    ).toBe(true);
    await rejected(
      () =>
        db.query("select public.finish_workspace_purge($1)", [directoryOrg]),
      "Workspace files still exist",
    );
    expect(
      (
        await db.query(
          "select * from public.list_workspace_purge_objects($1)",
          [directoryOrg],
        )
      ).rows,
    ).toEqual([
      { bucket_id: "report-exports", name: `${directoryOrg}/old/export.pdf` },
      { bucket_id: "report-images", name: path },
      { bucket_id: "report-images", name: `${directoryOrg}/orphan/photo.jpg` },
    ]);
    await db.exec("reset role");
    await rejected(
      () =>
        db.query(
          "update public.organizations set deleted_at=null where id=$1",
          [directoryOrg],
        ),
      "purge already started",
    );
    // Local metadata removal models successful Storage API deletion; never used against production Storage.
    await db.query("delete from storage.objects where name like $1", [
      directoryOrg + "/%",
    ]);
    await db.exec(
      "set request.jwt.claim.role='service_role';set role service_role",
    );
    expect(
      (
        await db.query<{ ok: boolean }>(
          "select public.finish_workspace_purge($1) ok",
          [directoryOrg],
        )
      ).rows[0].ok,
    ).toBe(true);
    expect(
      (
        await db.query<{ ok: boolean }>(
          "select public.finish_workspace_purge($1) ok",
          [directoryOrg],
        )
      ).rows[0].ok,
    ).toBe(false);
    await db.exec("reset role");
    for (const table of [
      "organizations",
      "courses",
      "class_sessions",
      "template_versions",
      "reports",
      "export_jobs",
      "report_attachments",
      "workspace_memberships",
      "workspace_invitations",
    ]) {
      expect(
        (
          await db.query(
            `select * from public.${table} where ${table === "organizations" ? "id" : "organization_id"}=$1`,
            [directoryOrg],
          )
        ).rows,
      ).toHaveLength(0);
    }
    expect(
      (
        await db.query("select * from public.template_fields where id=$1", [
          field,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query("select name from storage.objects where name=$1", [
          `${fallbackOrg}/keep/photo.jpg`,
        ])
      ).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from auth.users where id=$1", [owner])).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query("select * from public.organizations where id=$1", [
          fallbackOrg,
        ])
      ).rows,
    ).toHaveLength(1);
  });
});

it("suspension stays visible to admins, denies access, can reactivate, and is distinct from removal", async () => {
  await directoryFixture(async () => {
    await user(owner);
    await db.query("select public.switch_workspace($1)", [directoryOrg]);
    await db.query(
      "select public.manage_workspace_member($1,$2,'coach','inactive')",
      [directoryOrg, member],
    );
    expect(
      (
        await db.query(
          "select status from public.list_workspace_participants($1) where user_id=$2",
          [directoryOrg, member],
        )
      ).rows,
    ).toEqual([{ status: "inactive" }]);
    const invitation = (
      await db.query<{ id: string }>(
        "select public.create_workspace_invitation('member@fixture.test') id",
      )
    ).rows[0].id;
    await user(member);
    await rejected(() =>
      db.query("select public.switch_workspace($1)", [directoryOrg]),
    );
    await rejected(
      () =>
        db.query("select public.respond_workspace_invitation($1,true)", [
          invitation,
        ]),
      "Suspended membership",
    );
    await user(owner);
    await db.query(
      "select public.manage_workspace_member($1,$2,'coach','active')",
      [directoryOrg, member],
    );
    await user(member);
    await db.query("select public.switch_workspace($1)", [directoryOrg]);
    await user(owner);
    await db.query(
      "select public.manage_workspace_member($1,$2,'coach','inactive')",
      [directoryOrg, member],
    );
    await db.query("select public.remove_workspace_participant($1,$2)", [
      directoryOrg,
      member,
    ]);
    expect(
      (
        await db.query(
          "select user_id from public.list_workspace_participants($1) where user_id=$2",
          [directoryOrg, member],
        )
      ).rows,
    ).toHaveLength(0);
    await rejected(
      () =>
        db.query(
          "select public.manage_workspace_member($1,$2,'coach','active')",
          [directoryOrg, member],
        ),
      "Invite required",
    );
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select status from public.workspace_memberships where user_id=$1 and organization_id=$2",
          [member, directoryOrg],
        )
      ).rows,
    ).toEqual([{ status: "removed" }]);
    expect(
      (await db.query("select id from auth.users where id=$1", [member])).rows,
    ).toHaveLength(1);
  });
});
it("logs are service-only, sanitized, and purge retries do not starve unattempted workspaces", async () => {
  await directoryFixture(async () => {
    await user(owner);
    await rejected(() =>
      db.query(
        "select public.record_maintenance_failure(gen_random_uuid(),'sessions_sync',null,'42501')",
      ),
    );
    await rejected(() =>
      db.query("select * from private.maintenance_failures"),
    );
    await db.exec("reset role;set role anon");
    await rejected(() =>
      db.query(
        "select public.record_maintenance_failure(gen_random_uuid(),'sessions_sync',null,'42501')",
      ),
    );
    await db.exec(
      "reset role;insert into public.organizations(name,deleted_at) select 'Expired fixture',now()-interval '40 days' from generate_series(1,11);set request.jwt.claim.role='service_role';set role service_role",
    );
    const first = (
      await db.query<{ id: string }>(
        "select * from public.list_workspaces_due_for_purge()",
      )
    ).rows;
    expect(first).toHaveLength(10);
    await db.query("select public.begin_workspace_purge($1)", [first[0].id]);
    const next = (
      await db.query<{ id: string }>(
        "select * from public.list_workspaces_due_for_purge()",
      )
    ).rows;
    expect(next.map((x) => x.id)).not.toContain(first[0].id);
    await db.query(
      "select public.record_maintenance_failure(gen_random_uuid(),'retention_finish',$1,'PT409')",
      [first[0].id],
    );
    await rejected(() =>
      db.query(
        "select public.record_maintenance_failure(gen_random_uuid(),'retention_finish',null,'secret@example.test')",
      ),
    );
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select stage,error_code from private.maintenance_failures where stage='retention_finish'",
        )
      ).rows,
    ).toEqual([{ stage: "retention_finish", error_code: "PT409" }]);
  });
});

it("preserves existing hidden memberships as removed during rollout without deleting the account", async () => {
  await db.exec("reset role");
  expect(
    (
      await db.query(
        "select wm.status,u.id from public.workspace_memberships wm join auth.users u on u.id=wm.user_id where wm.user_id='10000000-0000-4000-8000-000000000007'",
      )
    ).rows,
  ).toEqual([
    { status: "removed", id: "10000000-0000-4000-8000-000000000007" },
  ]);
});

it("scopes template publishing/deletion to the selected workspace and preserves report history", async () => {
  const owner = "10000000-0000-4000-8000-000000000081";
  const a = "20000000-0000-4000-8000-000000000081";
  const b = "20000000-0000-4000-8000-000000000082";
  const course = "30000000-0000-4000-8000-000000000081";
  const session = "40000000-0000-4000-8000-000000000081";
  await db.exec(`reset role;
    insert into auth.users(id,email,email_confirmed_at) values('${owner}','template-admin@fixture.test',now());
    insert into private.signup_existing_accounts(user_id) values('${owner}');
    insert into public.organizations(id,name) values('${a}','Template A'),('${b}','Template B');
    insert into public.profiles(id,organization_id,name,role,status) values('${owner}','${a}','Template Admin','admin','active');
    insert into public.workspace_memberships(user_id,organization_id,role,status) values('${owner}','${a}','admin','active'),('${owner}','${b}','admin','active');`);
  await user(owner);
  const fields = [{ label: "내용", field_type: "long_text", required: true, options: [] }];
  async function save(workspace: string, id: string | null = null, version: string | null = null) {
    return (await db.query<{ id: string }>(
      "select public.save_workspace_template($1,$2,$3,$4,true,'수업 보고서') id",
      [workspace, id, version, fields],
    )).rows[0].id;
  }
  const first = await save(a);
  const firstVersion = (await db.query<{ version: string }>("select updated_at::text version from public.template_versions where id=$1", [first])).rows[0].version;
  await db.exec(`reset role;
    insert into public.courses(id,organization_id,title,location,created_by,updated_by) values('${course}','${a}','Class','Room','${owner}','${owner}');
    insert into public.class_sessions(id,organization_id,course_id,title,location,start_at,end_at,created_by,updated_by) values('${session}','${a}','${course}','Class','Room','2050-01-01 00:00:00Z','2050-01-01 01:00:00Z','${owner}','${owner}');
    insert into public.reports(organization_id,class_session_id,author_id,template_version_id) values('${a}','${session}','${owner}','${first}');`);
  await user(owner);
  await db.query("select public.switch_workspace($1)", [b]);
  const second = await save(b);
  await expect(save(a)).rejects.toThrow(/administrator/);
  await expect(save(b, first, firstVersion)).rejects.toThrow(/not found/);
  await expect(db.query("select public.deactivate_workspace_template($1,$2)", [a, first])).rejects.toThrow(/administrator/);
  await expect(db.query("select public.deactivate_workspace_template($1,$2)", [b, first])).rejects.toThrow(/not found/);
  expect((await db.query("select id from public.template_versions")).rows).toEqual([{ id: second }]);
  await db.query("select public.switch_workspace($1)", [a]);
  const replacement = await save(a, first, firstVersion);
  expect(replacement).not.toBe(first);
  expect((await db.query("select template_version_id from public.reports where class_session_id=$1", [session])).rows).toEqual([{ template_version_id: first }]);
  await db.query("select public.deactivate_workspace_template($1,$2)", [a, replacement]);
  expect((await db.query("select id from public.template_versions where status='active'")).rows).toHaveLength(0);
  expect((await db.query("select template_version_id from public.reports where class_session_id=$1", [session])).rows).toEqual([{ template_version_id: first }]);
  await db.query("select public.switch_workspace($1)", [b]);
  expect((await db.query("select id from public.template_versions where status='active'")).rows).toEqual([{ id: second }]);
  await db.exec(`reset role;update public.workspace_memberships set role='coach' where user_id='${owner}' and organization_id='${b}';`);
  await user(owner);
  await expect(save(b)).rejects.toThrow(/administrator/);
  await expect(db.query("select public.deactivate_workspace_template($1,$2)", [b, second])).rejects.toThrow(/administrator/);
});

it("new workspaces have independent published defaults usable immediately and replaceable without losing reports", async () => {
  const owner = "10000000-0000-4000-8000-000000000083";
  await db.exec(`reset role;
    insert into auth.users(id,email,email_confirmed_at) values('${owner}','default-template@fixture.test',now());
    insert into auth.identities(user_id,provider) values('${owner}','google');
    insert into private.signup_existing_accounts(user_id) values('${owner}');`);
  await user(owner);
  const a = (await db.query<{ id: string }>("select public.create_workspace('Default template A') id")).rows[0].id;
  const first = (await db.query<{ id: string; status: string; name: string; published_at: string; updated_at: string }>(
    "select id,status,name,published_at,updated_at::text from public.template_versions where organization_id=$1", [a],
  )).rows;
  expect(first).toHaveLength(1);
  expect(first[0]).toMatchObject({ name: "기본 수업 보고서", status: "active" });
  expect(first[0].published_at).toBeTruthy();
  const fields = (await db.query<{ label: string; required: boolean; settings: unknown }>(
    "select label,required,settings from public.template_fields where template_version_id=$1 order by sort_order", [first[0].id],
  )).rows;
  expect(fields.map(f => f.label)).toEqual(["참여 인원", "수업 내용", "특이사항", "다음 수업 계획", "활동 사진"]);
  expect(fields.filter(f => f.required).map(f => f.label)).toEqual(["참여 인원", "수업 내용"]);
  expect(fields[4].settings).toEqual({ max_files: 3 });
  await expect(db.query("select private.install_default_report_template($1,$2)", [a, owner])).rejects.toThrow(/permission denied/);
  await db.exec("reset role");
  expect((await db.query<{ id: string | null }>("select private.install_default_report_template($1,$2) id", [a, owner])).rows[0].id).toBeNull();
  const course = "30000000-0000-4000-8000-000000000083";
  const session = "40000000-0000-4000-8000-000000000083";
  await db.exec(`insert into public.courses(id,organization_id,title,location,created_by,updated_by) values('${course}','${a}','Class','Room','${owner}','${owner}');
    insert into public.class_sessions(id,organization_id,course_id,title,location,start_at,end_at,created_by,updated_by) values('${session}','${a}','${course}','Class','Room','2050-01-01 00:00:00Z','2050-01-01 01:00:00Z','${owner}','${owner}');`);
  await user(owner);
  await db.query("select public.get_or_create_report($1)", [session]);
  const b = (await db.query<{ id: string }>("select public.create_workspace('Default template B') id")).rows[0].id;
  const second = (await db.query<{ id: string }>("select id from public.template_versions where organization_id=$1 and status='active'", [b])).rows[0].id;
  expect(second).not.toBe(first[0].id);
  await db.query("select public.switch_workspace($1)", [a]);
  await db.query("select public.save_workspace_template($1,$2,$3,$4,true,'맞춤 보고서')", [
    a, first[0].id, first[0].updated_at, [{ label: "맞춤 내용", field_type: "long_text", required: true, options: [] }],
  ]);
  expect((await db.query("select template_version_id from public.reports where class_session_id=$1", [session])).rows).toEqual([{ template_version_id: first[0].id }]);
  await db.exec("reset role");
  expect((await db.query<{ id: string | null }>("select private.install_default_report_template($1,$2) id", [a, owner])).rows[0].id).toBeNull();
  expect((await db.query("select id from public.template_versions where organization_id=$1 and status='active'", [b])).rows).toEqual([{ id: second }]);
  expect((await db.query("select name from public.template_versions where organization_id=$1 and status='active'", [a])).rows).toEqual([{ name: "맞춤 보고서" }]);
});

it("rolls back workspace, membership and selection if default template installation fails", async () => {
  const owner = "10000000-0000-4000-8000-000000000083";
  await db.exec("reset role");
  const before = (await db.query("select organization_id from public.profiles where id=$1", [owner])).rows;
  await db.exec(`create function public.qa_reject_default_template() returns trigger language plpgsql as $$begin raise exception 'Injected template failure'; end$$;
    create trigger qa_reject_default before insert on public.template_versions for each row execute function public.qa_reject_default_template();`);
  try {
    await user(owner);
    await expect(db.query("select public.create_workspace('Rollback default test')")).rejects.toThrow('Injected template failure');
    await db.exec("reset role");
    expect((await db.query("select id from public.organizations where name='Rollback default test'")).rows).toHaveLength(0);
    expect((await db.query("select organization_id from public.profiles where id=$1", [owner])).rows).toEqual(before);
    expect((await db.query("select count(*)::int n from public.workspace_memberships where user_id=$1", [owner])).rows[0]).toEqual({ n: 2 });
  } finally {
    await db.exec("reset role;drop trigger qa_reject_default on public.template_versions;drop function public.qa_reject_default_template()");
  }
});
