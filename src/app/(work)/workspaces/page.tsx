import { redirect } from "next/navigation";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { CreateWorkspaceForm } from "@/features/workspaces/create-form";

export const metadata = { title: "워크스페이스 관리" };

export default async function WorkspacesPage() {
  const { profile, workspace, workspaces } = await requireCurrentProfile();
  if (profile.role !== "admin") redirect("/dashboard");

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold">워크스페이스</h1>
        <p className="mt-2 text-neutral-600">
          기관별 수업·일정·보고서·구성원을 서로 분리합니다.
        </p>
      </header>
      <section className="surface p-6">
        <h2 className="font-bold">참여 중인 워크스페이스</h2>
        <ul className="mt-4 divide-y divide-neutral-100">
          {workspaces.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-4 py-4">
              <span className="min-w-0">
                <strong className="block truncate">{item.name}</strong>
                <span className="text-xs text-neutral-500">
                  {item.role === "admin" ? "관리자" : "코치"}
                </span>
              </span>
              {item.id === workspace.id && (
                <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white">
                  현재 사용 중
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="border-t border-neutral-200 pt-8">
        <h2 className="mb-4 text-lg font-bold">새 워크스페이스</h2>
        <CreateWorkspaceForm />
      </section>
    </div>
  );
}
