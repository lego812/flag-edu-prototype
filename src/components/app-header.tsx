import Link from "@/components/feedback-link";
import type { WorkspaceSummary } from "@/features/auth/current-user";
import { WorkspaceSwitcher } from "@/features/workspaces/switcher";
import { WorkspaceSync } from "@/features/workspaces/sync";
import { AppNavigation } from "./app-navigation";
import { HeaderLeading } from "./header-leading";
export function AppHeader({
  userId,
  isAdmin,
  workspace,
  workspaces,
}: {
  userId: string;
  name: string;
  isAdmin: boolean;
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
}) {
  return (
    <header className="app-header">
      <WorkspaceSync userId={userId} workspaceId={workspace.id} />
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <HeaderLeading />
        <AppNavigation isAdmin={isAdmin} />
        <div className="ml-auto flex min-w-0 items-center gap-3">
          <WorkspaceSwitcher current={workspace} workspaces={workspaces} />
          <Link
            href="/manage/account"
            aria-label="계정 관리"
            className="min-h-11 whitespace-nowrap rounded-full border border-neutral-300 px-4 py-3 text-xs font-medium"
          >
            계정
          </Link>
        </div>
      </div>
    </header>
  );
}
