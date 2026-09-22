import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
const adminName = process.argv[3]?.trim() || "테스트 관리자";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");

if (!email || !email.includes("@")) {
  throw new Error("사용법: npm run invite:admin -- <EMAIL> [NAME]");
}

if (!supabaseUrl || !secretKey || !siteUrl) {
  throw new Error("Supabase 서버 환경변수가 누락되었습니다.");
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const { data: authUsers, error: usersError } =
  await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });

if (usersError) {
  throw usersError;
}

if (authUsers.users.some((user) => user.email?.toLowerCase() === email)) {
  throw new Error("이미 가입되었거나 초대된 이메일입니다.");
}

const { data: organizations, error: organizationError } = await supabase
  .from("organizations")
  .select("id, name")
  .order("created_at", { ascending: true })
  .limit(1);

if (organizationError || !organizations?.[0]) {
  throw organizationError ?? new Error("연결할 기관이 없습니다.");
}

const { data: invitation, error: invitationError } =
  await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/set-password`,
    data: { name: adminName, must_change_password: true },
  });

if (invitationError || !invitation.user) {
  throw invitationError ?? new Error("관리자 초대를 만들지 못했습니다.");
}

const { error: profileError } = await supabase.from("profiles").insert({
  id: invitation.user.id,
  organization_id: organizations[0].id,
  name: adminName,
  role: "admin",
  status: "active",
});

if (profileError) {
  await supabase.auth.admin.deleteUser(invitation.user.id);
  throw profileError;
}

console.log(
  JSON.stringify({
    result: "invited",
    email,
    organization: organizations[0].name,
    role: "admin",
  }),
);
