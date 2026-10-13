"use client";

import { useEffect } from "react";
import { startWorkspaceSync } from "./sync-client";

export function WorkspaceSync({ userId, workspaceId, role }: { userId: string; workspaceId: string; role: "admin" | "coach" }) {
  useEffect(() => startWorkspaceSync({
    userId,
    workspaceId,
    role,
    navigate: (path) => window.location.replace(path),
  }), [userId, workspaceId, role]);
  return null;
}
