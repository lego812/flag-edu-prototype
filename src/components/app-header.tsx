import type { WorkspaceSummary } from "@/features/auth/current-user";
import { WorkspaceSwitcher } from "@/features/workspaces/switcher";
import { WorkspaceSync } from "@/features/workspaces/sync";
import { AppNavigation } from "./app-navigation";
import { HeaderLeading } from "./header-leading";
export function AppHeader({
  userId,
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
      <WorkspaceSync userId={userId} workspaceId={workspace.id} role={workspace.role} />
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <HeaderLeading />
        <AppNavigation />
        <div className="ml-auto flex min-w-0 items-center gap-3">
          <WorkspaceSwitcher current={workspace} workspaces={workspaces} />
        </div>
      </div>
    </header>
  );
}
