import { FilterForm } from "@/components/filter-form";
import { SubmitButton } from "@/components/submit-button";
export function Search({
  path,
  q,
  label,
}: {
  path: string;
  q: string;
  label: string;
}) {
  return (
    <FilterForm action={path} className="flex flex-wrap items-end gap-3">
      <label className="min-w-0 flex-1 text-sm font-medium">
        {label}
        <input
          className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3"
          name="q"
          type="search"
          defaultValue={q}
          maxLength={100}
        />
      </label>
      <SubmitButton className="btn" pendingLabel="조회 중…">
        검색
      </SubmitButton>
    </FilterForm>
  );
}
export { Pagination } from "@/components/pagination";
