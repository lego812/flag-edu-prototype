import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { canManageClass, isUuid } from "@/features/classes/model";
import { classRepository } from "@/features/classes/repository";
import { formatClassDate } from "@/features/classes/dates";
import { CancelClassForm } from "@/features/classes/cancel-form";
import { ActionButton } from "@/components/action-button";
import { startReportAction } from "@/features/reports/actions";
export const metadata = { title: "수업 상세" };
export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { supabase, profile } = await requireCurrentProfile();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { data: session, error } = await classRepository(supabase, profile).get(
    id,
  );
  if (error) throw new Error("Class lookup failed");
  if (!session) notFound();
  const manageable = canManageClass(profile, session);
  const { data: myReport } = await supabase
    .from("reports")
    .select("id,status")
    .eq("class_session_id", id)
    .eq("author_id", profile.id)
    .maybeSingle();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/classes" className="text-sm text-black">
        ← 수업 목록
      </Link>
      <section className="border-y border-neutral-200 py-6">
        <p className="text-sm font-semibold text-black">
          {session.status === "cancelled" ? "취소된 수업" : "예정"}
          {session.created_by === profile.id ? " · 내가 등록" : ""}
        </p>
        <h1 className="mt-3 break-words text-3xl font-bold">{session.title}</h1>
        <dl className="mt-6 space-y-5">
          <div>
            <dt className="text-sm text-neutral-500">장소 또는 기관명</dt>
            <dd className="mt-1 break-words">{session.location}</dd>
          </div>
          <div>
            <dt className="text-sm text-neutral-500">수업 일시 (한국 시간)</dt>
            <dd className="mt-1">
              {formatClassDate(session.start_at)}
              <br />~ {formatClassDate(session.end_at)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-neutral-500">메모</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words">
              {session.memo || "등록된 메모가 없습니다."}
            </dd>
          </div>
        </dl>
        {manageable && (
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={"/classes/" + id + "/edit"}
              className="rounded-lg bg-black px-5 py-3 font-semibold text-white"
            >
              수업 수정
            </Link>
            {session.status !== "cancelled" && <CancelClassForm id={id} />}
          </div>
        )}
      </section>
      <section className="py-2">
        <h2 className="font-bold">내 보고서</h2>
        <div className="mt-3">
          {myReport ? (
            <Link href={"/reports/" + myReport.id} className="btn">
              {myReport.status === "draft" ? "계속 작성" : "내 보고서 조회"}
            </Link>
          ) : session.status === "cancelled" ? (
            <p className="text-sm text-neutral-600">
              취소된 수업에는 새 보고서를 작성하거나 제출할 수 없습니다.
            </p>
          ) : (
            <ActionButton action={startReportAction.bind(null, id)}>
              보고서 작성
            </ActionButton>
          )}
        </div>
        {profile.role === "admin" && (
          <Link
            className="mt-3 inline-block text-sm underline"
            href={"/admin-reports?session=" + id}
          >
            이 수업의 전체 보고서
          </Link>
        )}
      </section>
    </div>
  );
}
