import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { canManageClass, isUuid } from "@/features/classes/model";
import { classRepository } from "@/features/classes/repository";
import { ClassForm } from "@/features/classes/class-form";
export const metadata = { title: "수업 수정" };
export default async function EditClassPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, profile } = await requireCurrentProfile();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { data: session, error } = await classRepository(supabase, profile).get(id);
  if (error) throw new Error("Class lookup failed");
  if (!session) notFound();
  if (!canManageClass(profile, session)) return <div><h1 className="text-2xl font-bold">수정 권한이 없습니다</h1><p className="my-4">수업 등록자와 관리자만 수정할 수 있습니다.</p><Link href={"/classes/" + id} className="text-blue-700">수업 상세로 돌아가기</Link></div>;
  return <div className="mx-auto max-w-2xl"><h1 className="mb-6 text-3xl font-bold">수업 수정</h1>
    {session.status === "cancelled" && <p className="mb-4 rounded-xl bg-slate-100 p-4 text-sm">취소된 수업입니다. 내용을 수정해도 취소 상태는 유지됩니다.</p>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><ClassForm session={session} /></section>
  </div>;
}
