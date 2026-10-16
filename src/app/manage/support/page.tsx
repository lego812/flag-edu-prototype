import Link from "@/components/feedback-link";
import { masterAccount } from "@/features/master/access";
import {
  inquiryPage,
  inquiryTime,
  type InquiryList,
} from "@/features/support/model";
import { Pagination } from "@/components/pagination";
export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { supabase, isMaster } = await masterAccount();
  const page = inquiryPage((await searchParams).page);
  const { data, error } = await supabase.rpc("list_support_inquiries", {
    p_page: page,
  });
  if (error || !data)
    throw new Error("문의글 목록을 불러오지 못했습니다. 다시 시도해 주세요.");
  const result = data as InquiryList;
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">고객센터</h1>
          <p className="mt-3 text-sm text-neutral-600">
            {isMaster
              ? "전체 회원의 문의글을 조회합니다."
              : "서비스 이용 중 궁금한 점이나 불편한 점을 남겨 주세요."}
          </p>
        </div>
        {!isMaster && (
          <Link href="/manage/support/new" className="btn">
            문의 등록
          </Link>
        )}
      </header>
      <h2 className="text-xl font-bold">
        {isMaster ? "전체 문의글" : "내가 쓴 문의글"}
      </h2>
      <ul className="space-y-4">
        {result.items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/manage/support/${item.id}`}
              className="surface block space-y-2 p-5 sm:p-6"
            >
              <h3 className="break-words font-bold">{item.title}</h3>
              {isMaster && (
                <p className="break-all text-sm">
                  {item.author_name} · {item.author_email || "이메일 없음"}
                </p>
              )}
              <p className="text-sm text-neutral-500">
                작성 {inquiryTime(item.created_at)}
                {item.updated_at !== item.created_at &&
                  ` · 수정 ${inquiryTime(item.updated_at)}`}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {!result.items.length && (
        <p className="surface p-6 text-neutral-600">
          {isMaster
            ? "등록된 문의글이 없습니다."
            : "아직 작성한 문의글이 없습니다."}
        </p>
      )}
      <Pagination path="/manage/support" page={page} total={result.total} />
    </>
  );
}
