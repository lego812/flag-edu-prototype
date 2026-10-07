"use client";

import { useEffect } from "react";
import { startWorkspaceSync } from "./sync-client";

export function WorkspaceSync({ userId, workspaceId }: { userId: string; workspaceId: string }) {
  useEffect(() => startWorkspaceSync({
    userId,
    workspaceId,
    navigate: (path) => window.location.replace(path),
  }), [userId, workspaceId]);
  return null;
}
