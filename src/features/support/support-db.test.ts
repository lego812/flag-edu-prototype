// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { beforeAll, afterAll, it, expect } from "vitest";
let db: PGlite;
const uid = (n: number) =>
  `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const coach = uid(1),
  admin = uid(2),
  other = uid(3),
  master = uid(4),
  pending = uid(5);
const inquiry = uid(100),
  adminInquiry = uid(101),
  otherInquiry = uid(102);
let org: string;
async function asUser(id: string) {
  await db.exec(
    `reset role;set request.jwt.claim.sub='${id}';set request.jwt.claim.role='authenticated';set role authenticated`,
  );
}
async function rpc<T = unknown>(sql: string, args: unknown[] = []) {
  return (await db.query<{ result: T }>(`select ${sql} result`, args)).rows[0]
    .result;
}
async function read(id = inquiry) {
  return rpc<{
    title: string;
    body: string;
    created_at: string;
    updated_at: string;
    author_email: string | null;
  }>("public.get_support_inquiry($1)", [id]);
}
async function save(
  id: string,
  title = "문의",
  body = "확인 부탁드립니다.",
  version: string | null = null,
) {
  return rpc("public.save_support_inquiry($1,$2,$3,$4)", [
    id,
    title,
    body,
    version,
  ]);
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
    if (file.endsWith("_signup_required_consent.sql"))
      for (const id of [coach, admin, other, master])
        await db.query(
          "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
          [id, id === master ? "davin990812@gmail.com" : `${id}@example.test`],
        );
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
  await asUser(admin);
  org = await rpc<string>("public.create_workspace('Support A')");
  await db.exec("reset role");
  for (const id of [coach, other, master])
    await db.query(
      "insert into public.profiles(id,organization_id,name,role,status) values($1,$2,'테스트','coach','active')",
      [id, id === coach ? org : null],
    );
  await db.query(
    "insert into public.workspace_memberships(user_id,organization_id,role,status) values($1,$2,'coach','active')",
    [coach, org],
  );
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'pending@example.test',now())",
    [pending],
  );
  await db.query(
    "insert into public.profiles(id,name,role,status) values($1,'미동의','coach','inactive')",
    [pending],
  );
  await asUser(coach);
  expect(await save(inquiry)).toBe(inquiry);
  await asUser(admin);
  expect(await save(adminInquiry, "관리자 문의")).toBe(adminInquiry);
  await asUser(other);
  expect(await save(otherInquiry, "무소속 문의")).toBe(otherInquiry);
}, 30000);
afterAll(async () => {
  await db?.close();
});
it("isolates own inquiries from peers and workspace admins, including direct table reads", async () => {
  for (const [actor, ownId] of [
    [coach, inquiry],
    [admin, adminInquiry],
    [other, otherInquiry],
  ]) {
    await asUser(actor);
    const list = await rpc<{
      total: number;
      items: { id: string; body?: string; author_email: string | null }[];
    }>("public.list_support_inquiries()");
    expect(list.total).toBe(1);
    expect(list.items.map((i) => i.id)).toEqual([ownId]);
    expect(list.items[0].body).toBeUndefined();
    expect(list.items[0].author_email).toBeNull();
    for (const id of [inquiry, adminInquiry, otherInquiry].filter(
      (i) => i !== ownId,
    )) {
      expect(await read(id)).toBeNull();
      expect(
        (
          await db.query(
            "select id from public.support_inquiries where id=$1",
            [id],
          )
        ).rows,
      ).toHaveLength(0);
    }
  }
});
it("allows master to read all authors while denying all creates, edits and direct writes", async () => {
  await asUser(master);
  const list = await rpc<{ total: number; items: { author_email: string }[] }>(
    "public.list_support_inquiries()",
  );
  expect(list.total).toBe(3);
  expect(
    list.items.every((i) => i.author_email.endsWith("@example.test")),
  ).toBe(true);
  const item = await read();
  expect(item.body).toBe("확인 부탁드립니다.");
  expect(
    (await db.query("select id from public.support_inquiries")).rows,
  ).toHaveLength(3);
  await expect(save(uid(103))).rejects.toMatchObject({ code: "42501" });
  await expect(
    save(inquiry, "변경", "변경", item.updated_at),
  ).rejects.toMatchObject({ code: "42501" });
  for (const sql of [
    "update public.support_inquiries set title='변경'",
    "delete from public.support_inquiries",
    "insert into public.support_inquiries(id,author_id,title,body) values(gen_random_uuid(),auth.uid(),'x','x')",
  ])
    await expect(db.query(sql)).rejects.toMatchObject({ code: "42501" });
});
it("edits only the owner, rejects stale versions, preserves creation date and prevents duplicate registration", async () => {
  await asUser(coach);
  const before = await read();
  expect(before.created_at).toBe(before.updated_at);
  expect(await save(inquiry)).toBe(inquiry);
  expect((await read()).updated_at).toBe(before.updated_at);
  await expect(save(inquiry, "충돌", "다른 내용")).rejects.toMatchObject({
    code: "40001",
  });
  expect(await save(inquiry, "수정 문의", "수정 내용", before.updated_at)).toBe(
    inquiry,
  );
  const after = await read();
  expect(after).toMatchObject({
    title: "수정 문의",
    body: "수정 내용",
    created_at: before.created_at,
  });
  expect(after.updated_at).not.toBe(before.updated_at);
  await expect(
    save(inquiry, "옛 화면", "덮어쓰기", before.updated_at),
  ).rejects.toMatchObject({ code: "40001" });
  await asUser(admin);
  await expect(
    save(inquiry, "다른 사람", "수정", after.updated_at),
  ).rejects.toMatchObject({ code: "42501" });
  await expect(save(inquiry)).rejects.toMatchObject({ code: "42501" });
  await asUser(coach);
  expect((await read()).body).toBe("수정 내용");
});
it("keeps account-owned inquiries after workspace removal and deletion", async () => {
  await asUser(admin);
  await rpc("public.remove_workspace_participant($1,$2)", [org, coach]);
  await asUser(coach);
  const item = await read();
  expect(item).not.toBeNull();
  await save(inquiry, "참여 종료 후", "문의 수정 가능", item.updated_at);
  await asUser(admin);
  await rpc("public.delete_workspace($1,'Support A')", [org]);
  expect(await read(adminInquiry)).not.toBeNull();
  await asUser(coach);
  expect(await read()).not.toBeNull();
});
it("rejects anonymous, subjectless, unconsented and no-longer-verified callers", async () => {
  for (const actor of ["", pending]) {
    await asUser(actor);
    await expect(rpc("public.list_support_inquiries()")).rejects.toMatchObject({
      code: "42501",
    });
    await expect(save(uid(104))).rejects.toMatchObject({ code: "42501" });
    expect(
      (await db.query("select id from public.support_inquiries")).rows,
    ).toHaveLength(0);
  }
  await db.exec("reset role");
  await db.query("update auth.users set email_confirmed_at=null where id=$1", [
    coach,
  ]);
  await asUser(coach);
  await expect(read()).rejects.toMatchObject({ code: "42501" });
  await expect(save(uid(104))).rejects.toMatchObject({ code: "42501" });
  await db.exec("reset role");
  await db.query("update auth.users set email_confirmed_at=now() where id=$1", [
    coach,
  ]);
  await db.exec("set role anon");
  for (const sql of [
    "select * from public.support_inquiries",
    "select public.list_support_inquiries()",
    "select public.get_support_inquiry(gen_random_uuid())",
    "select public.save_support_inquiry(gen_random_uuid(),'a','b')",
  ])
    await expect(db.query(sql)).rejects.toThrow();
});
it("validates content and bounds pages independently of client checks", async () => {
  await asUser(coach);
  for (const [title, body] of [
    ["", "x"],
    [" \t\n", "x"],
    ["x", ""],
    ["x".repeat(101), "x"],
    ["x", "x".repeat(5001)],
  ])
    await expect(save(uid(110), title, body)).rejects.toMatchObject({
      code: "22023",
    });
  for (const page of [0, -1, 100001, null])
    await expect(
      rpc("public.list_support_inquiries($1)", [page]),
    ).rejects.toMatchObject({ code: "22023" });
  for (let n = 200; n < 222; n++) await save(uid(n), `문의 ${n}`, "내용");
  const first = await rpc<{ total: number; items: { id: string }[] }>(
    "public.list_support_inquiries(1)",
  );
  const next = await rpc<{ total: number; items: { id: string }[] }>(
    "public.list_support_inquiries(2)",
  );
  expect(first.total).toBe(23);
  expect(first.items).toHaveLength(20);
  expect(next.items).toHaveLength(3);
  expect(new Set([...first.items, ...next.items].map((i) => i.id)).size).toBe(
    23,
  );
  expect(await rpc("public.list_support_inquiries(99)")).toEqual({
    total: 23,
    items: [],
  });
});
