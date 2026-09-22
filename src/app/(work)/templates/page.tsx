import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCurrentProfile } from "@/features/auth/current-user";
export default async function TemplatesPage() {
  const { supabase, profile } = await requireCurrentProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  const { data, error } = await supabase
    .from("template_versions")
    .select("id,name,version,status")
    .eq("organization_id", profile.organization_id)
    .order("version", { ascending: false });
  if (error) throw new Error("템플릿 조회 실패");
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">보고서 템플릿</h1>
        <Link href="/templates/new" className="btn">
          새 템플릿
        </Link>
      </div>
      <p className="text-sm text-neutral-600">
        게시된 버전은 보존되며 새 보고서에는 현재 활성 버전이 사용됩니다.
      </p>
      <ul className="divide-y divide-neutral-200">
        {data?.map((t) => (
          <li key={t.id} className="flex items-center justify-between py-4">
            <span>
              <strong>{t.name}</strong> · 버전 {t.version} ·{" "}
              {t.status === "active"
                ? "사용 중"
                : t.status === "draft"
                  ? "초안"
                  : "보관"}
            </span>
            <Link className="btn-secondary" href={"/templates/" + t.id}>
              {t.status === "draft" ? "편집" : "조회 / 새 버전 만들기"}
            </Link>
          </li>
        ))}
      </ul>
      {!data?.length && (
        <p>템플릿을 만들고 게시하면 코치가 보고서를 작성할 수 있습니다.</p>
      )}
    </>
  );
}
