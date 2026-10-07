import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startWorkspaceSync, WORKSPACE_SYNC_INTERVAL } from "./sync-client";

const workspaceA = "f8601730-c133-41b8-8d69-316edc982195";
const workspaceB = "b91c4416-12ea-49e8-b061-82f9f4f9eb11";
let userNumber = 0;
let userId: string;
let cleanup: (() => void) | undefined;
const navigate = vi.fn();
const fetchIdentity = vi.fn();

class Channel {
  static instances: Channel[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  close = vi.fn();
  constructor(public name: string) { Channel.instances.push(this); }
  notify(data = "workspace-changed") { this.onmessage?.(new MessageEvent("message", { data })); }
}

function identity(workspaceId = workspaceA, id = userId) {
  return Response.json({ userId: id, workspaceId });
}
function start(workspaceId = workspaceA) {
  cleanup = startWorkspaceSync({ userId, workspaceId, navigate });
  return vi.advanceTimersByTimeAsync(0);
}

describe("workspace tab synchronization", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    Channel.instances = [];
    userId = `10000000-0000-4000-8000-${String(++userNumber).padStart(12, "0")}`;
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.stubGlobal("BroadcastChannel", Channel);
    vi.stubGlobal("fetch", fetchIdentity);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    fetchIdentity.mockResolvedValue(identity());
  });
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("checks server identity without announcing or navigating on first mount", async () => {
    await start();
    expect(navigate).not.toHaveBeenCalled();
    expect(Channel.instances[0].name).toBe(`flag-edu-workspace:${userId}`);
    expect(Channel.instances[0].postMessage).not.toHaveBeenCalled();
    expect(fetchIdentity).toHaveBeenCalledWith("/api/workspaces/current", expect.objectContaining({ cache: "no-store", credentials: "same-origin" }));
  });

  it("announces a server-rendered switch after a route remount", async () => {
    await start();
    cleanup?.();
    fetchIdentity.mockResolvedValue(identity(workspaceB));
    await start(workspaceB);
    expect(Channel.instances[1].postMessage).toHaveBeenCalledWith("workspace-changed");
    expect(window.localStorage.getItem(`flag-edu-workspace:${userId}`)).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("moves stale tabs to home only after verifying the changed server identity", async () => {
    await start();
    fetchIdentity.mockResolvedValue(identity(workspaceB));
    Channel.instances[0].notify();
    await vi.advanceTimersByTimeAsync(0);
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/dashboard");
  });

  it("uses storage notifications when BroadcastChannel is unavailable", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    await start();
    fetchIdentity.mockResolvedValue(identity(workspaceB));
    window.dispatchEvent(new StorageEvent("storage", { key: `flag-edu-workspace:${userId}`, newValue: "untrusted hint" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(navigate).toHaveBeenCalledWith("/dashboard");
  });

  it("ignores another account's storage events and unknown channel messages", async () => {
    await start();
    fetchIdentity.mockClear();
    window.dispatchEvent(new StorageEvent("storage", { key: "flag-edu-workspace:someone-else", newValue: "changed" }));
    Channel.instances[0].notify("unknown");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchIdentity).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not switch based on a forged hint when the server workspace is unchanged", async () => {
    await start();
    Channel.instances[0].notify();
    await vi.advanceTimersByTimeAsync(0);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("checks foreground resumes, restored pages and visible polling", async () => {
    await start();
    fetchIdentity.mockClear();
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
    window.dispatchEvent(new Event("pageshow"));
    await vi.advanceTimersByTimeAsync(0);
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(WORKSPACE_SYNC_INTERVAL);
    expect(fetchIdentity).toHaveBeenCalledTimes(4);
  });

  it("does not poll a hidden tab, and catches its workspace change on return", async () => {
    await start();
    vi.mocked(Object.getOwnPropertyDescriptor(document, "visibilityState")!.get!).mockReturnValue("hidden");
    fetchIdentity.mockClear();
    await vi.advanceTimersByTimeAsync(WORKSPACE_SYNC_INTERVAL);
    expect(fetchIdentity).not.toHaveBeenCalled();
    vi.mocked(Object.getOwnPropertyDescriptor(document, "visibilityState")!.get!).mockReturnValue("visible");
    fetchIdentity.mockResolvedValue(identity(workspaceB));
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(navigate).toHaveBeenCalledWith("/dashboard");
  });

  it("retains a pending signal and rechecks after an in-flight response", async () => {
    let resolve!: (response: Response) => void;
    fetchIdentity.mockImplementationOnce(() => new Promise<Response>(r => { resolve = r; }));
    cleanup = startWorkspaceSync({ userId, workspaceId: workspaceA, navigate });
    Channel.instances[0].notify();
    fetchIdentity.mockResolvedValue(identity(workspaceB));
    resolve(identity());
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchIdentity).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/dashboard");
  });

  it("does not wipe input for offline, malformed or server-error responses", async () => {
    fetchIdentity.mockRejectedValueOnce(new Error("offline"));
    await start();
    fetchIdentity.mockResolvedValueOnce(Response.json({ workspaceId: workspaceB }));
    Channel.instances[0].notify();
    await vi.advanceTimersByTimeAsync(0);
    fetchIdentity.mockResolvedValueOnce(new Response(null, { status: 500 }));
    Channel.instances[0].notify();
    await vi.advanceTimersByTimeAsync(0);
    expect(navigate).not.toHaveBeenCalled();
    fetchIdentity.mockResolvedValue(identity(workspaceB));
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
    expect(navigate).toHaveBeenCalledWith("/dashboard");
  });

  it("clears old account screens when the authenticated account changes", async () => {
    fetchIdentity.mockResolvedValue(identity(workspaceA, "20000000-0000-4000-8000-000000000001"));
    await start();
    expect(navigate).toHaveBeenCalledWith("/dashboard");
  });

  it("only follows known same-origin authentication redirects", async () => {
    fetchIdentity.mockResolvedValue({ redirected: true, url: "https://untrusted.example/login" });
    await start();
    expect(navigate).not.toHaveBeenCalled();
    fetchIdentity.mockResolvedValue({ redirected: true, url: `${window.location.origin}/set-password` });
    Channel.instances[0].notify();
    await vi.advanceTimersByTimeAsync(0);
    expect(navigate).toHaveBeenCalledWith("/set-password");
  });

  it("still detects changes when storage access is denied", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("storage denied"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage denied"); });
    await start();
    cleanup?.();
    fetchIdentity.mockResolvedValue(identity(workspaceB));
    await start(workspaceB);
    expect(Channel.instances[1].postMessage).toHaveBeenCalledWith("workspace-changed");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("cleans up listeners, intervals and pending requests on unmount", async () => {
    const response = Promise.withResolvers<Response>();
    fetchIdentity.mockReturnValue(response.promise);
    cleanup = startWorkspaceSync({ userId, workspaceId: workspaceA, navigate });
    const signal = fetchIdentity.mock.calls[0][1].signal as AbortSignal;
    cleanup();
    cleanup = undefined;
    expect(signal.aborted).toBe(true);
    expect(Channel.instances[0].close).toHaveBeenCalledOnce();
    response.resolve(identity(workspaceB));
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(WORKSPACE_SYNC_INTERVAL);
    expect(navigate).not.toHaveBeenCalled();
    expect(fetchIdentity).toHaveBeenCalledOnce();
  });
});
