"use client";
import { useEffect, useState } from "react";
import { searchClasses } from "./search";
import { formatClassDate } from "./dates";
type Choice = {
  id: string;
  title: string;
  start_at: string;
  has_time?: boolean;
};
export function ClassSearchPicker({ selected }: { selected?: Choice | null }) {
  const [choice, setChoice] = useState(selected);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Choice[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    if (!query.trim()) return;
    const timer = setTimeout(async () => {
      try {
        const result = await searchClasses(query);
        if (active) {
          setResults(result.data);
          setError(result.error || "");
        }
      } catch {
        if (active) setError("수업을 검색하지 못했습니다.");
      } finally {
        if (active) setBusy(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);
  return (
    <div className="space-y-2">
      <input type="hidden" name="session" value={choice?.id || ""} />
      <label className="block text-sm">
        수업
        <input
          type="search"
          className="input mt-1"
          placeholder="수업명 검색"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setChoice(null);
            setError("");
            setResults([]);
            setBusy(!!e.target.value.trim());
          }}
        />
      </label>
      {choice && (
        <div className="flex items-center justify-between rounded-xl bg-white p-3 text-sm">
          <span>
            {choice.title} · {formatClassDate(choice.start_at, choice.has_time)}
          </span>
          <button
            type="button"
            aria-label="수업 선택 해제"
            className="size-11"
            onClick={() => {
              setChoice(null);
              setQuery("");
            }}
          >
            ×
          </button>
        </div>
      )}
      {busy && (
        <div
          role="status"
          aria-label="수업 검색 중"
          className="size-5 animate-spin rounded-full border-2 border-neutral-200 border-t-black"
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {!busy && query && !choice && (
        <ul className="max-h-64 overflow-auto rounded-xl bg-white">
          {results.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="w-full px-4 py-3 text-left hover:bg-neutral-100"
                onClick={() => {
                  setChoice(s);
                  setQuery("");
                }}
              >
                <span className="block text-sm font-medium">{s.title}</span>
                <span className="text-xs text-neutral-500">
                  {formatClassDate(s.start_at, s.has_time)}
                </span>
              </button>
            </li>
          ))}
          {!results.length && !error && (
            <li className="p-4 text-sm text-neutral-500">
              검색 결과가 없습니다.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
