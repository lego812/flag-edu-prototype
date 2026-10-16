import Link from "@/components/feedback-link";
import InquiryUnavailable from "@/features/support/unavailable";
import { getInquiry } from "@/features/support/repository";
import { inquiryTime } from "@/features/support/model";
export default async function InquiryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const result = await getInquiry((await params).id);
  if (!result) return <InquiryUnavailable />;
  const { inquiry, isMaster, user } = result;
  return (
    <>
      <Link href="/manage/support" className="text-sm underline">
        고객센터 목록
      </Link>
      <article className="surface space-y-6 p-5 sm:p-8">
        <header className="space-y-3 border-b border-neutral-200 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <h1 className="min-w-0 flex-1 break-words text-2xl font-bold">
              {inquiry.title}
            </h1>
            {!isMaster && inquiry.author_id === user.id && (
              <Link href={`/manage/support/${inquiry.id}/edit`} className="btn">
                편집
              </Link>
            )}
          </div>
          {isMaster && (
            <p className="break-all text-sm">
              {inquiry.author_name} · {inquiry.author_email || "이메일 없음"}
            </p>
          )}
          <p className="text-sm text-neutral-500">
            작성 {inquiryTime(inquiry.created_at)} · 수정{" "}
            {inquiryTime(inquiry.updated_at)} (한국 시간)
          </p>
        </header>
        <p className="whitespace-pre-wrap break-words leading-8">
          {inquiry.body}
        </p>
      </article>
    </>
  );
}
