import { redirect } from "next/navigation";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { ExportForm } from "@/features/exports/form";
import { formatClassDate } from "@/features/classes/dates";
import { isExportExpired } from "@/features/exports/policy";
export default async function ExportsPage() {
  const { supabase, profile } = await requireCurrentProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  const [members, sessions, jobs] = await Promise.all([
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
    supabase
      .from("export_jobs")
      .select("id,format,status,created_at,error_message,expires_at,storage_path")
      .eq("requested_by", profile.id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  if (members.error || sessions.error || jobs.error)
    throw new Error("내보내기 정보 조회 실패");
  return (
    <>
      <h1 className="text-2xl font-bold">보고서 내보내기</h1>
      <p className="text-sm text-neutral-600">
        한 번에 최대 200개입니다. PDF에는 원본 사진이 포함되며 사진 합계가
        15MiB를 넘으면 범위를 줄여야 합니다. 생성 파일은 본인만 7일간 다시
        다운로드할 수 있습니다.
      </p>
      <ExportForm members={members.data ?? []} sessions={sessions.data ?? []} />
      <h2 className="pt-6 text-lg font-bold">내 생성 이력 (최근 30개)</h2>
      <ul className="divide-y divide-neutral-200">
        {jobs.data?.map((j) => {
          const expired = isExportExpired(j.expires_at);
          return (
            <li
              key={j.id}
              className="flex flex-wrap items-center justify-between gap-3 py-4"
            >
              <span>
                {formatClassDate(j.created_at)} · {j.format.toUpperCase()} ·{" "}
                {expired
                  ? "보관 만료"
                  : (
                      {
                        queued: "대기",
                        processing: "생성 중",
                        completed: "완료",
                        failed: "실패",
                      } as Record<string, string>
                    )[j.status]}
                {j.error_message && (
                  <span className="block text-sm text-red-700">
                    {j.error_message}
                  </span>
                )}
              </span>
              {j.status === "completed" &&
                j.storage_path &&
                !expired && (
                  <a className="btn-secondary" href={"/api/exports/" + j.id}>
                    다운로드
                  </a>
                )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
