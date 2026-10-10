export function LoadingSpinner({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`loading-spinner ${className}`} />;
}

export function PageLoading({ label = "화면을 불러오고 있어요", fullScreen = false }: { label?: string; fullScreen?: boolean }) {
  return (
    <section role="status" aria-label={label} aria-live="polite" className={fullScreen ? "page-loading-overlay" : "space-y-5 py-4"}>
      <div className={fullScreen ? "w-full max-w-lg space-y-5 px-6" : "space-y-5"}>
        <div className="flex items-center gap-3 text-sm font-medium text-neutral-600">
          <LoadingSpinner className="size-5" />
        </div>
        <div aria-hidden="true" className="space-y-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="loading-skeleton space-y-3 rounded-3xl bg-white p-6">
              <div className="h-4 w-1/3 rounded-full bg-neutral-200" />
              <div className="h-3 w-2/3 rounded-full bg-neutral-100" />
              <div className="h-3 w-1/2 rounded-full bg-neutral-100" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
