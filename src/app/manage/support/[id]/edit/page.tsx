import Link from "@/components/feedback-link";
import InquiryUnavailable from "@/features/support/unavailable";
import { getInquiry } from "@/features/support/repository";
import { InquiryForm } from "@/features/support/form";
export default async function EditInquiryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const result = await getInquiry((await params).id);
  if (!result) return <InquiryUnavailable />;
  const { inquiry, isMaster, user } = result;
  if (isMaster || inquiry.author_id !== user.id) return <InquiryUnavailable />;
  return (
    <>
      <Link
        href={`/manage/support/${inquiry.id}`}
        className="text-sm underline"
      >
        문의글 보기
      </Link>
      <h1 className="text-3xl font-bold">문의글 편집</h1>
      <InquiryForm
        key={inquiry.id}
        id={inquiry.id}
        title={inquiry.title}
        body={inquiry.body}
        version={inquiry.updated_at}
      />
    </>
  );
}
