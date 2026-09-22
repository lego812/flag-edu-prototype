"use client";
export default function ClassError({ reset }: { reset: () => void }) {
  return <div role="alert" className="rounded-xl bg-red-50 p-6 text-red-900"><h2 className="font-bold">수업 정보를 불러오지 못했습니다</h2><p className="mt-2">네트워크 연결을 확인한 뒤 다시 시도해 주세요.</p><button onClick={reset} className="mt-4 rounded-lg border border-red-300 px-4 py-3">다시 시도</button></div>;
}
