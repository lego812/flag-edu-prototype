import { isUuid } from "@/features/classes/model";

const observedWorkspaces = new Map<string, string>();
const authDestinations = new Set(["/login", "/set-password", "/access-denied"]);
export const WORKSPACE_SYNC_INTERVAL = 30_000;

export function startWorkspaceSync({
  userId,
  workspaceId,
  navigate,
}: {
  userId: string;
  workspaceId: string;
  navigate: (path: string) => void;
}) {
  const key = `flag-edu-workspace:${userId}`;
  let channel: BroadcastChannel | undefined;
  let disposed = false;
  let navigating = false;
  let checking = false;
  let queued = false;
  let controller: AbortController | undefined;

  // Notifications are hints, never an authority for workspace or permissions.
  async function check() {
    if (disposed || navigating) return;
    if (checking) {
      queued = true;
      return;
    }
    checking = true;
    controller = new AbortController();
    try {
      const response = await fetch("/api/workspaces/current", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (disposed) return;
      let destination: string | undefined;
      if (response.redirected) {
        const target = new URL(response.url, window.location.origin);
        if (target.origin === window.location.origin && authDestinations.has(target.pathname)) {
          destination = target.pathname;
        }
      } else if (response.status === 401) {
        destination = "/login";
      } else if (response.ok) {
        const identity: unknown = await response.json();
        if (
          identity && typeof identity === "object" &&
          "userId" in identity && typeof identity.userId === "string" && isUuid(identity.userId) &&
          "workspaceId" in identity && typeof identity.workspaceId === "string" && isUuid(identity.workspaceId) &&
          (identity.userId !== userId || identity.workspaceId !== workspaceId)
        ) {
          destination = "/dashboard";
        }
      }
      if (destination && !disposed && !navigating) {
        navigating = true;
        // A document navigation clears stale Router Cache, editor state and IDs.
        // It never saves an old workspace's unsaved input into the new one.
        navigate(destination);
      }
    } catch {
      // Offline/aborted checks do not wipe input. Retry on focus or the timer.
    } finally {
      checking = false;
      if (queued && !disposed && !navigating) {
        queued = false;
        void check();
      }
    }
  }

  try {
    channel = new BroadcastChannel(key);
    channel.onmessage = (event: MessageEvent) => {
      if (event.data === "workspace-changed") void check();
    };
  } catch {
    // Storage events and foreground checks support browsers without this API.
  }

  let previous = observedWorkspaces.get(userId);
  try {
    previous = window.sessionStorage.getItem(key) ?? previous;
    window.sessionStorage.setItem(key, workspaceId);
  } catch {
    // The in-memory value survives client route remounts if storage is denied.
  }
  observedWorkspaces.set(userId, workspaceId);
  if (previous && previous !== workspaceId) {
    try { channel?.postMessage("workspace-changed"); } catch { /* channel denied */ }
    try {
      window.localStorage.setItem(key, `${Date.now()}:${Math.random()}`);
    } catch { /* foreground checks remain available */ }
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === key && event.newValue !== null) void check();
  };
  const onForeground = () => {
    if (document.visibilityState === "visible") void check();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("focus", onForeground);
  window.addEventListener("pageshow", onForeground);
  document.addEventListener("visibilitychange", onForeground);
  const timer = window.setInterval(onForeground, WORKSPACE_SYNC_INTERVAL);
  void check();

  return () => {
    disposed = true;
    controller?.abort();
    window.clearInterval(timer);
    channel?.close();
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("focus", onForeground);
    window.removeEventListener("pageshow", onForeground);
    document.removeEventListener("visibilitychange", onForeground);
  };
}
