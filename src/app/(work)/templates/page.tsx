import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { TemplateDeleteButton } from "@/features/templates/delete-button";
export default async function TemplatesPage() {
  const { supabase, profile } = await requireCurrentProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  const { data, error } = await supabase
    .from("template_versions")
    .select("id,name,status,group_id,updated_at")
    .eq("organization_id", profile.organization_id)
    .is("hidden_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw new Error("템플릿 조회 실패");
  const groups = new Map<string, NonNullable<typeof data>>();
  for (const template of data ?? []) {
    const group = template.group_id ?? template.id;
    groups.set(group, [...(groups.get(group) ?? []), template]);
  }
  const templates = [...groups.values()].map((versions) => {
    const draft = versions.find((template) => template.status === "draft");
    const active = versions.find((template) => template.status === "active");
    return { display: draft ?? active ?? versions[0], active: Boolean(active) };
  });
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">보고서 템플릿</h1>
        <Link href="/templates/new" className="btn">
          새 템플릿
        </Link>
      </div>
      <p className="text-sm text-neutral-600">
        수정해도 기존 보고서의 양식과 내용은 그대로 유지됩니다.
      </p>
      <ul className="space-y-3">
        {templates.map(({ display: t, active }) => (
          <li key={t.group_id ?? t.id} className="surface flex flex-wrap items-center justify-between gap-4 border border-neutral-200 p-5">
            <span className="min-w-0">
              <strong className="block break-words text-lg">{t.name}</strong>
              {active ? (
                <span className="mt-2 inline-flex rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white shadow-sm">사용 중</span>
              ) : t.status === "draft" ? (
                <span className="mt-2 inline-flex rounded-full bg-neutral-200 px-3 py-1 text-xs font-semibold">수정 중</span>
              ) : (
                <span className="mt-2 text-xs text-neutral-500">사용 안 함</span>
              )}
            </span>
            <div className="flex flex-wrap gap-2">
              <Link className="btn-secondary" href={"/templates/" + t.id}>
                {t.status === "draft" ? "수정" : "조회 / 수정"}
              </Link>
              <TemplateDeleteButton id={t.id} name={t.name} />
            </div>
          </li>
        ))}
      </ul>
      {!templates.length && (
        <p>템플릿을 만들고 게시하면 코치가 보고서를 작성할 수 있습니다.</p>
      )}
    </>
  );
}
