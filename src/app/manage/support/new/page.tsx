import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import Link from "@/components/feedback-link";
import { masterAccount } from "@/features/master/access";
import { InquiryForm } from "@/features/support/form";
export default async function NewInquiryPage() {
  const { isMaster } = await masterAccount();
  if (isMaster) notFound();
  return (
    <>
      <Link href="/manage/support" className="text-sm underline">
        고객센터 목록
      </Link>
      <h1 className="text-3xl font-bold">문의 등록</h1>
      <InquiryForm id={randomUUID()} />
    </>
  );
}
