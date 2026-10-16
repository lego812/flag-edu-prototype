import Link from "@/components/feedback-link";
import { requireAccountWithWorkspaces } from "@/features/auth/current-user";
import { AppHeader } from "@/components/app-header";
export const metadata = { title: "고객센터" };
export default async function SupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, workspace, workspaces } =
    await requireAccountWithWorkspaces();
  return (
    <>
      {workspace && profile.status === "active" ? (
        <AppHeader
          userId={user.id}
          name={profile.name}
          isAdmin={workspace.role === "admin"}
          workspace={workspace}
          workspaces={workspaces}
        />
      ) : (
        <header className="mx-auto w-full max-w-5xl px-5 pt-8">
          <Link href="/manage/account" className="text-sm underline">
            계정 관리로
          </Link>
        </header>
      )}
      <main className="mx-auto w-full max-w-5xl space-y-6 px-5 py-8">
        {children}
      </main>
    </>
  );
}
