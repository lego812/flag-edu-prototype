const publicEnvValues = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
} as const;

export type PublicEnv = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

export type ServerEnv = PublicEnv & {
  supabaseSecretKey: string;
  siteUrl: string;
};

export function getPublicEnvStatus() {
  const missing = Object.entries(publicEnvValues)
    .filter(([, value]) => !value?.trim())
    .map(([key]) => key);

  return {
    configured: missing.length === 0,
    missing,
  };
}

export function requirePublicEnv(): PublicEnv {
  const status = getPublicEnvStatus();

  if (!status.configured) {
    throw new Error(
      `Supabase 환경변수가 누락되었습니다: ${status.missing.join(", ")}`,
    );
  }

  return {
    supabaseUrl: publicEnvValues.NEXT_PUBLIC_SUPABASE_URL!,
    supabasePublishableKey:
      publicEnvValues.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  };
}

export function requireServerEnv(): ServerEnv {
  const publicEnv = requirePublicEnv();
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (!supabaseSecretKey) {
    throw new Error("서버 환경변수 SUPABASE_SECRET_KEY가 누락되었습니다.");
  }

  if (!siteUrl) {
    throw new Error("환경변수 NEXT_PUBLIC_SITE_URL이 누락되었습니다.");
  }

  return {
    ...publicEnv,
    supabaseSecretKey,
    siteUrl: siteUrl.replace(/\/$/, ""),
  };
}
