import { isUuid } from "@/features/classes/model";

const observedWorkspaces = new Map<string, string>();
const authDestinations = new Set(["/login", "/set-password", "/access-denied"]);
export const WORKSPACE_SYNC_INTERVAL = 30_000;
const requestTimeout = 10_000;
const retryDelay = 1_000;
const transientStatuses = new Set([500, 502, 503, 504]);

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
  let deadline: number | undefined;
  let retryTimer: number | undefined;

  // Notifications are hints, never an authority for workspace or permissions.
  async function check(attempt = 0) {
    if (disposed || navigating) return;
    if (checking) {
      queued = true;
      return;
    }
    window.clearTimeout(retryTimer);
    retryTimer = undefined;
    checking = true;
    const requestController = new AbortController();
    controller = requestController;
    let fetching = true;
    let timedOut = false;
    let retryable = false;
    // Bound both the request and body parsing. Abort alone cannot release a
    // stalled body/transport that ignores its signal, so race the full check.
    const timeout = new Promise<never>((_, reject) => {
      deadline = window.setTimeout(() => {
        timedOut = true;
        requestController.abort();
        reject(new Error("Workspace identity check timed out"));
      }, requestTimeout);
    });
    try {
      const response = await Promise.race([fetch("/api/workspaces/current", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: requestController.signal,
      }), timeout]);
      fetching = false;
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
        const identity: unknown = await Promise.race([response.json(), timeout]);
        if (
          identity && typeof identity === "object" &&
          "userId" in identity && typeof identity.userId === "string" && isUuid(identity.userId) &&
          "workspaceId" in identity && typeof identity.workspaceId === "string" && isUuid(identity.workspaceId) &&
          (identity.userId !== userId || identity.workspaceId !== workspaceId)
        ) {
          destination = "/dashboard";
        }
      } else {
        retryable = transientStatuses.has(response.status);
      }
      if (destination && !disposed && !navigating) {
        navigating = true;
        // A document navigation clears stale Router Cache, editor state and IDs.
        // It never saves an old workspace's unsaved input into the new one.
        navigate(destination);
      }
    } catch (error) {
      // Failed checks never authorize navigation or wipe unsaved input.
      retryable = fetching || timedOut || error instanceof TypeError;
    } finally {
      window.clearTimeout(deadline);
      deadline = undefined;
      controller = undefined;
      checking = false;
      if (queued && !disposed && !navigating) {
        queued = false;
        void check();
      } else if (retryable && attempt === 0 && !disposed && !navigating && document.visibilityState === "visible") {
        // One short retry handles transient outages without an unbounded loop.
        // The regular foreground/polling checks remain the fallback.
        retryTimer = window.setTimeout(() => void check(1), retryDelay);
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
    window.clearTimeout(deadline);
    window.clearTimeout(retryTimer);
    window.clearInterval(timer);
    channel?.close();
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("focus", onForeground);
    window.removeEventListener("pageshow", onForeground);
    document.removeEventListener("visibilitychange", onForeground);
  };
}
