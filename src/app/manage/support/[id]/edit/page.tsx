import Link from "@/components/feedback-link";
import { notFound } from "next/navigation";
import { getInquiry } from "@/features/support/repository";
import { InquiryForm } from "@/features/support/form";
export default async function EditInquiryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { inquiry, isMaster, user } = await getInquiry((await params).id);
  if (isMaster || inquiry.author_id !== user.id) notFound();
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
