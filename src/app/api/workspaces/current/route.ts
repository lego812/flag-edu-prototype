import { NextResponse } from "next/server";
import { requireCurrentProfile } from "@/features/auth/current-user";

export const dynamic = "force-dynamic";

export async function GET() {
  const { profile, workspace } = await requireCurrentProfile();
  return NextResponse.json(
    { userId: profile.id, workspaceId: workspace.id },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
