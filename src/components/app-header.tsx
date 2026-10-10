import { SubmitButton } from "@/components/submit-button";
import { logoutAction } from "@/features/auth/actions";
import type { WorkspaceSummary } from "@/features/auth/current-user";
import { WorkspaceSwitcher } from "@/features/workspaces/switcher";
import { WorkspaceSync } from "@/features/workspaces/sync";
import { AppNavigation } from "./app-navigation";
import { HeaderLeading } from "./header-leading";
export function AppHeader({
  userId,
  name,
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
          <span className="hidden max-w-32 truncate text-sm text-neutral-600 lg:inline">
            {name}
          </span>
          <form action={logoutAction}>
            <SubmitButton pendingLabel="로그아웃 중…" className="min-h-11 rounded-full border border-neutral-300 px-4 text-xs font-medium">
              로그아웃
            </SubmitButton>
          </form>
        </div>
      </div>
    </header>
  );
}
