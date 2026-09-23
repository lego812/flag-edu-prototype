import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCurrentProfile } from "@/features/auth/current-user";
export default async function ManagePage() {
  const { profile } = await requireCurrentProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  const items = [
    {
      href: "/admin-reports",
      title: "전체 보고서",
      description: "작성된 보고서를 살펴보세요.",
    },
    {
      href: "/templates",
      title: "보고서 양식",
      description: "코치가 작성할 질문을 구성합니다.",
    },
    {
      href: "/members",
      title: "구성원",
      description: "초대와 권한을 관리합니다.",
    },
    {
      href: "/exports",
      title: "내보내기",
      description: "기록을 PDF와 Excel로 모아 보세요.",
    },
  ];
  return (
    <>
      <header className="py-5">
        <p className="eyebrow">WORKSPACE</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          함께하는 수업을
          <br />
          한곳에서.
        </h1>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <Link
            href={item.href}
            key={item.href}
            className="surface flex min-h-40 flex-col justify-between p-7"
          >
            <div>
              <h2 className="text-xl font-bold">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                {item.description}
              </p>
            </div>
            <span aria-hidden="true" className="mt-5 self-end text-xl">
              ↗
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
