import { requireCurrentProfile } from "@/features/auth/current-user";
import { isUuid } from "@/features/classes/model";
import { NextResponse } from "next/server";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, profile } = await requireCurrentProfile();
  const { id } = await params;
  if (profile.role !== "admin" || !isUuid(id))
    return new Response("접근할 수 없습니다.", { status: 403 });
  const { data } = await supabase
    .from("export_jobs")
    .select("storage_path,format")
    .eq("id", id)
    .eq("requested_by", profile.id)
    .eq("status", "completed")
    .single();
  if (!data?.storage_path)
    return new Response("파일을 찾을 수 없습니다.", { status: 404 });
  const signed = await supabase.storage
    .from("report-exports")
    .createSignedUrl(data.storage_path, 60, {
      download: `flag-edu-${id}.${data.format}`,
    });
  if (!signed.data)
    return new Response("파일을 열지 못했습니다.", { status: 500 });
  const response = NextResponse.redirect(signed.data.signedUrl);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
