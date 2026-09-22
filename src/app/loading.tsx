export default function Loading() {
  return (
    <div
      role="status"
      aria-label="페이지 로딩"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#f3f3f2]/90"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 80 80"
        className="size-16 animate-spin motion-reduce:animate-none"
        fill="currentColor"
      >
        <circle cx="40" cy="17" r="12" />
        <circle cx="20" cy="52" r="12" />
        <circle cx="60" cy="52" r="12" />
        <circle cx="40" cy="40" r="8" />
      </svg>
    </div>
  );
}
