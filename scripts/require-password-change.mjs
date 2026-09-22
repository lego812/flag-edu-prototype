import { createClient } from "@supabase/supabase-js";

const userId = process.argv[2];
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!userId) {
  throw new Error(
    "사용법: npm run require-password-change -- <AUTH_USER_UUID>",
  );
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

const { data, error: readError } =
  await supabase.auth.admin.getUserById(userId);

if (readError) {
  throw readError;
}

const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
  user_metadata: {
    ...data.user.user_metadata,
    must_change_password: true,
  },
});

if (updateError) {
  throw updateError;
}

console.log(JSON.stringify({ result: "password_change_required" }));
