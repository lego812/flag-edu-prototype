import Link from "@/components/feedback-link";
import { notFound } from "next/navigation";
import { isUuid } from "@/features/classes/model";
import { requireMaster } from "@/features/master/access";
import {
  dateTime,
  queryParams,
  sections,
  statusLabel,
  type Params,
  type WorkspaceDetail,
} from "@/features/master/model";
import { Pagination } from "@/features/master/navigation";
import { FIELD_TYPES } from "@/features/reports/model";
export default async function MasterWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Params>;
}) {
  const { supabase } = await requireMaster();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { section, page } = queryParams(await searchParams);
  const { data, error } = await supabase.rpc("master_workspace", {
    p_workspace_id: id,
    p_section: section,
    p_page: page,
  });
  if (error) throw new Error("워크스페이스 내용을 불러오지 못했습니다.");
  if (!data) notFound();
  const result = data as WorkspaceDetail;
  const path = `/manage/all-workspaces/${id}`;
  return (
    <>
      <header>
        <h1 className="break-words text-3xl font-bold">
          {result.workspace.name}
        </h1>
        <p className="mt-3 text-sm text-neutral-600">
          조회 전용 · 현재 사용 중인 워크스페이스는 변경되지 않습니다.
        </p>
      </header>
      <nav aria-label="워크스페이스 정보" className="flex flex-wrap gap-2">
        {Object.entries(sections).map(([key, label]) => (
          <Link
            key={key}
            href={`${path}?section=${key}`}
            aria-current={section === key ? "page" : undefined}
            className={`rounded-full border px-4 py-3 text-sm ${section === key ? "bg-neutral-900 text-white" : "bg-white"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <h2 className="text-xl font-bold">{sections[section]}</h2>
      <ul className="space-y-4">
        {result.items.map((row) => (
          <li key={row.id} className="surface space-y-3 p-5 sm:p-6">
            <h3 className="break-words font-bold">
              {section === "reports" ? (
                <Link href={`${path}/reports/${row.id}`} className="underline">
                  {row.title}
                </Link>
              ) : (
                (row.title ?? row.name)
              )}
            </h3>
            {row.author && (
              <p className="text-sm">
                작성자: {row.author} · {dateTime(row.created_at)}
              </p>
            )}
            {row.role && (
              <p className="text-sm">
                {row.role === "admin" ? "관리자" : "코치"}
              </p>
            )}
            {row.status && (
              <p className="text-sm">
                {section === "templates" && row.status === "draft"
                  ? "미게시"
                  : section === "templates" && row.status === "active"
                    ? "게시 중"
                    : (statusLabel[row.status] ?? row.status)}
                {row.version != null && ` · 버전 ${row.version}`}
              </p>
            )}
            {row.active != null && (
              <p className="text-sm">{row.active ? "사용 중" : "비활성"}</p>
            )}
            {row.location && (
              <p className="break-words text-sm">장소: {row.location}</p>
            )}
            {row.start_at && (
              <p className="text-sm">
                {dateTime(row.start_at, row.has_time !== false)}
                {row.end_at &&
                  ` ~ ${dateTime(row.end_at, row.has_time !== false)}`}
                {row.has_time === false && " · 시간 미정"} (한국 시간)
              </p>
            )}
            {row.teaching_method && (
              <p className="whitespace-pre-wrap break-words text-sm">
                진행방식: {row.teaching_method}
              </p>
            )}
            {row.memo && (
              <p className="whitespace-pre-wrap break-words text-sm">
                메모: {row.memo}
              </p>
            )}
            {row.fields && (
              <ul className="divide-y divide-neutral-100">
                {row.fields.map((f) => (
                  <li key={f.id} className="space-y-1 py-3 text-sm">
                    <p className="break-words font-medium">
                      {f.label} · {FIELD_TYPES[f.field_type]} ·{" "}
                      {f.required ? "필수" : "선택"}
                    </p>
                    {f.help_text && (
                      <p className="break-words text-neutral-600">
                        {f.help_text}
                      </p>
                    )}
                    {!!f.options.length && (
                      <p className="break-words">
                        선택지: {f.options.join(", ")}
                      </p>
                    )}
                    {f.field_type === "photo" && (
                      <p>최대 {f.settings.max_files ?? 3}장</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {!result.items.length && (
        <p className="surface p-6">표시할 내용이 없습니다.</p>
      )}
      <Pagination
        path={path}
        page={page}
        total={result.total}
        query={{ section }}
      />
    </>
  );
}
