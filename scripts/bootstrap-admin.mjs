import { createClient } from "@supabase/supabase-js";

const userId = process.argv[2];
const organizationName = process.argv[3] ?? "Flag Edu";
const adminName = process.argv[4] ?? "관리자";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!userId) {
  throw new Error(
    "사용법: node --env-file=.env.local scripts/bootstrap-admin.mjs <AUTH_USER_UUID>",
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

const { data: existingProfile, error: profileReadError } = await supabase
  .from("profiles")
  .select("id, organization_id, role, status")
  .eq("id", userId)
  .maybeSingle();

if (profileReadError) {
  throw profileReadError;
}

if (existingProfile) {
  console.log(
    JSON.stringify({
      result: "already_exists",
      role: existingProfile.role,
      status: existingProfile.status,
    }),
  );
  process.exit(0);
}

const { data: existingOrganizations, error: organizationReadError } =
  await supabase
    .from("organizations")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1);

if (organizationReadError) {
  throw organizationReadError;
}

let organization = existingOrganizations?.[0];
let createdOrganizationId;

if (!organization) {
  const { data, error } = await supabase
    .from("organizations")
    .insert({ name: organizationName })
    .select("id, name")
    .single();

  if (error) {
    throw error;
  }

  organization = data;
  createdOrganizationId = data.id;
}

const { error: profileInsertError } = await supabase.from("profiles").insert({
  id: userId,
  organization_id: organization.id,
  name: adminName,
  role: "admin",
  status: "active",
});

if (profileInsertError) {
  if (createdOrganizationId) {
    await supabase.from("organizations").delete().eq("id", createdOrganizationId);
  }
  throw profileInsertError;
}

const { data: authUser, error: authUserReadError } =
  await supabase.auth.admin.getUserById(userId);

if (authUserReadError) {
  throw authUserReadError;
}

const { error: passwordFlagError } =
  await supabase.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...authUser.user.user_metadata,
      must_change_password: true,
    },
  });

if (passwordFlagError) {
  throw passwordFlagError;
}

console.log(
  JSON.stringify({
    result: "created",
    organization: organization.name,
    role: "admin",
    status: "active",
  }),
);
