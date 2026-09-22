"use client";
export default function WorkError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="space-y-4">
      <h1 className="text-xl font-bold">정보를 불러오지 못했습니다</h1>
      <p>네트워크와 DB 설정을 확인하고 다시 시도해 주세요.</p>
      <button className="btn" onClick={reset}>
        다시 시도
      </button>
    </div>
  );
}
