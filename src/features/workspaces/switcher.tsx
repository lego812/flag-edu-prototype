import type { WorkspaceSummary } from "@/features/auth/current-user";
import { switchWorkspaceAction } from "./actions";

export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
}) {
  if (workspaces.length < 2) {
    return (
      <span
        aria-label={`현재 워크스페이스 ${current.name}`}
        className="max-w-36 truncate rounded-full bg-white px-3 py-2 text-xs font-bold text-neutral-800"
      >
        {current.name}
      </span>
    );
  }

  return (
    <form action={switchWorkspaceAction} className="flex items-center gap-2">
      <label className="sr-only" htmlFor="workspace-select">
        워크스페이스
      </label>
      <select
        key={current.id}
        id="workspace-select"
        name="workspaceId"
        defaultValue={current.id}
        className="min-h-10 max-w-24 rounded-full border border-neutral-300 bg-white px-3 text-xs font-bold sm:max-w-36"
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
      <button className="min-h-10 rounded-full border border-neutral-300 bg-white px-3 text-xs font-semibold">
        전환
      </button>
    </form>
  );
}
