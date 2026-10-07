import { redirect } from "next/navigation";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { ExportForm } from "@/features/exports/form";
export default async function ExportsPage() {
  const { supabase, profile } = await requireCurrentProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  const [members, sessions] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,name")
      .eq("organization_id", profile.organization_id)
      .order("name"),
    supabase
      .from("class_sessions")
      .select("id,title")
      .eq("organization_id", profile.organization_id)
      .order("start_at", { ascending: false })
      .limit(200),
  ]);
  if (members.error || sessions.error)
    throw new Error("내보내기 정보 조회 실패");
  return (
    <>
      <h1 className="text-2xl font-bold">보고서 내보내기</h1>
      <p className="text-sm text-neutral-600">
        한 번에 최대 200개입니다. PDF에는 원본 사진이 포함되며 사진 합계는
        최대 100MiB까지 지원합니다. 파일은 생성 즉시 다운로드되며 서버에
        보관하지 않습니다.
      </p>
      <ExportForm members={members.data ?? []} sessions={sessions.data ?? []} />
    </>
  );
}
