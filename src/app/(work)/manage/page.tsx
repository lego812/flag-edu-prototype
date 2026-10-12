import Link from "@/components/feedback-link";
import { requireCurrentProfile } from "@/features/auth/current-user";
export default async function ManagePage() {
  const { profile, workspace } = await requireCurrentProfile();
  const groups = [
    {
      title: "계정",
      items: [
        {
          href: "/manage/account",
          title: "계정 관리",
          description: "계정 정보와 로그인 방식을 확인하고 로그아웃합니다.",
        },
      ],
    },
    {
      title: "워크스페이스",
      items: [
        {
          href: "/workspaces",
          title: "워크스페이스·참여자",
          description: "워크스페이스별 참여자와 권한, 초대를 확인합니다.",
        },
      ],
    },
    {
      title: "보고서 관리",
      items: [
        {
          href: "/admin-reports",
          title: "전체 보고서",
          description: "현재 워크스페이스의 보고서를 조회합니다.",
        },
        {
          href: "/templates",
          title: "보고서 양식",
          description: "작성 항목과 양식을 관리합니다.",
        },
        {
          href: "/exports",
          title: "보고서 다운로드",
          description: "보고서를 PDF·Excel로 내려받습니다.",
        },
      ],
    },
  ];
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold">관리</h1>
        <p className="mt-3 break-words text-sm text-neutral-600">
          현재 워크스페이스: {workspace.name}
        </p>
      </header>
      {groups
        .filter((g) => profile.role === "admin" || g.title !== "보고서 관리")
        .map((g) => (
          <section key={g.title}>
            <h2 className="mb-4 text-lg font-bold">{g.title}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {g.items.map((i) => (
                <Link href={i.href} key={i.href} className="surface block p-6">
                  <h3 className="font-bold">{i.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">
                    {i.description}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
