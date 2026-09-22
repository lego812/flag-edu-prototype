"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function ExportForm({
  members,
  sessions,
}: {
  members: { id: string; name: string }[];
  sessions: { id: string; title: string }[];
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const router = useRouter();
  async function submit(form: FormData) {
    setPending(true);
    setError("");
    try {
      const result = await fetch("/api/exports", {
        method: "POST",
        body: form,
      });
      if (!result.ok) {
        const data = await result.json();
        throw new Error(data.error);
      }
      const blob = await result.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `flag-edu.${form.get("format")}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "내보내기에 실패했습니다.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }
  return (
    <form action={submit} className="space-y-4">
      <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
        <label>
          수업 시작일
          <input className="input" type="date" name="from" />
        </label>
        <label>
          수업 종료일
          <input className="input" type="date" name="to" />
        </label>
        <label>
          작성자
          <select className="input" name="author">
            <option value="">전체</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          수업 (최근 200개)
          <select className="input" name="session">
            <option value="">전체</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          파일 형식
          <select className="input" name="format">
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="pdf">PDF</option>
          </select>
        </label>
        <button className="btn">
          {pending ? "파일 생성 중…" : "생성 및 다운로드"}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
