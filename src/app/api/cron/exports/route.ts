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
    const client = createAdminClient();
    const [removed, completed] = await Promise.all([
      cleanupExpiredExports(client),
      client.rpc("sync_completed_class_sessions", {
        p_organization_id: null,
      }),
    ]);
    if (completed.error) throw completed.error;
    return Response.json({ removed, completed: completed.data ?? 0 });
  } catch (error) {
    console.error(
      "Failed to clean up expired exports.",
      error instanceof Error ? error.message : "Unknown cleanup error",
    );
    return Response.json(
      { error: "만료된 내보내기 정리에 실패했습니다." },
      { status: 500 },
    );
  }
}
