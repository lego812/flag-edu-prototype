"use client";
import { useRouter } from "next/navigation";
export function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="뒤로가기"
      className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-white"
      onClick={() =>
        window.history.length > 1 ? router.back() : router.push("/dashboard")
      }
    >
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m15 5-7 7 7 7" />
      </svg>
    </button>
  );
}
