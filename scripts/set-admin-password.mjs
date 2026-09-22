import { createClient } from "@supabase/supabase-js";

const userId = process.argv[2];
const password = process.argv[3];
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!userId || !password) {
  throw new Error(
    "사용법: node --env-file=.env.local scripts/set-admin-password.mjs <AUTH_USER_UUID> <PASSWORD>",
  );
}

if (password.length < 8) {
  throw new Error("비밀번호는 8자 이상이어야 합니다.");
}

if (!supabaseUrl || !secretKey) {
  throw new Error("Supabase 서버 환경변수가 누락되었습니다.");
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const { data: profile, error: profileError } = await supabase
  .from("profiles")
  .select("role")
  .eq("id", userId)
  .single();

if (profileError || profile?.role !== "admin") {
  throw new Error("관리자 프로필을 찾을 수 없습니다.");
}

const { data: authUser, error: userReadError } =
  await supabase.auth.admin.getUserById(userId);

if (userReadError) {
  throw userReadError;
}

const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
  password,
  user_metadata: {
    ...authUser.user.user_metadata,
    must_change_password: false,
  },
});

if (updateError) {
  throw updateError;
}

console.log(JSON.stringify({ result: "admin_password_updated" }));
