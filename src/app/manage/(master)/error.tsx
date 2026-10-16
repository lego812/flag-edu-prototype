"use client";
export default function MasterError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="space-y-4">
      <h1 className="text-xl font-bold">정보를 불러오지 못했습니다</h1>
      <p>잠시 후 다시 시도해 주세요.</p>
      <button className="btn" onClick={reset}>
        다시 시도
      </button>
    </div>
  );
}
