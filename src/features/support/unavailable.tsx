import Link from "@/components/feedback-link";

export default function InquiryUnavailable() {
  return (
    <div className="py-10 text-center">
      <h1 className="text-2xl font-bold">문의글을 찾을 수 없습니다</h1>
      <p className="mt-3 text-neutral-600">
        존재하지 않거나 접근할 수 없는 문의글입니다.
      </p>
      <Link href="/manage/support" className="btn mt-6 inline-block">
        고객센터 목록
      </Link>
    </div>
  );
}
