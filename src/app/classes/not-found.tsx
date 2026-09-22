import Link from "next/link";
export default function ClassNotFound() {
  return <div className="py-10 text-center"><h1 className="text-2xl font-bold">수업을 찾을 수 없습니다</h1><p className="mt-3 text-neutral-600">존재하지 않거나 접근할 수 없는 수업입니다.</p><Link href="/classes" className="mt-6 inline-block text-black">수업 목록으로</Link></div>;
}
