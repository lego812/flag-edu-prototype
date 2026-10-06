import { cleanupExpiredExports } from "@/features/exports/cleanup";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (
    !secret ||
    request.headers.get("authorization") !== `Bearer ${secret}`
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const removed = await cleanupExpiredExports(createAdminClient());
    return Response.json({ removed });
  } catch {
    return Response.json(
      { error: "만료된 내보내기 정리에 실패했습니다." },
      { status: 500 },
    );
  }
}
