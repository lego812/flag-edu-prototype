// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// Exercise React's real server cache with a fresh render dispatcher per request.
// A normal Vitest React import uses the client build, whose cache is a no-op.
const serverReact = createRequire(import.meta.url)(
  join(dirname(createRequire(import.meta.url).resolve("react")), "react.react-server.js"),
);
const m = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const { dirname, join } = await import("node:path");
  const require = createRequire(import.meta.url);
  return { cache: require(join(dirname(require.resolve("react")), "react.react-server.js")).cache };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: m.getUser }, rpc: m.rpc, from: m.from }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error("REDIRECT:" + url); },
}));
import { requireAccount, requireAccountWithWorkspaces, requireCurrentProfile } from "./current-user";

async function renderRequest<T>(run: () => Promise<T>) {
  const internals = serverReact.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const previous = internals.A;
  const values = new Map();
  internals.A = {
    getCacheForType(factory: () => unknown) {
      if (!values.has(factory)) values.set(factory, factory());
      return values.get(factory);
    },
  };
  try { return await run(); } finally { internals.A = previous; }
}

beforeEach(() => {
  vi.clearAllMocks();
  m.getUser.mockResolvedValue({ data: { user: { id: "user-a", email_confirmed_at: "now" } } });
  m.rpc.mockResolvedValue({ data: true, error: null });
  m.from.mockImplementation((table: string) => {
    const query = {
      select: () => query, eq: () => query,
      single: async () => ({ data: { id: "user-a", organization_id: "org-a", status: "active" } }),
      order: async () => ({ data: [{ organization_id: "org-a", role: "coach", organizations: { id: "org-a", name: "A" } }], error: null }),
    };
    expect(["profiles", "workspace_memberships"]).toContain(table);
    return query;
  });
});

it("coalesces concurrent layout/page auth, consent, profile and membership reads within a render", async () => {
  await renderRequest(async () => {
    const [layout, page, account, memberships] = await Promise.all([
      requireCurrentProfile(), requireCurrentProfile(), requireAccount(), requireAccountWithWorkspaces(),
    ]);
    expect(layout).toBe(page);
    expect(layout.user).toBe(account.user);
    expect(layout.workspaces).toBe(memberships.workspaces);
    expect(layout.profile.role).toBe("coach");
  });
  expect(m.getUser).toHaveBeenCalledTimes(1);
  expect(m.rpc).toHaveBeenCalledTimes(1);
  expect(m.from.mock.calls.map(([table]) => table)).toEqual(["profiles", "workspace_memberships"]);
});

it("rechecks authentication on the next request after logout instead of reusing a previous user", async () => {
  await renderRequest(() => requireCurrentProfile());
  m.getUser.mockResolvedValue({ data: { user: null } });
  await expect(renderRequest(() => requireCurrentProfile())).rejects.toThrow("REDIRECT:/login");
  expect(m.getUser).toHaveBeenCalledTimes(2);
});

it("rechecks revoked workspace membership on the next request", async () => {
  await renderRequest(() => requireCurrentProfile());
  m.from.mockImplementation(() => {
    const q = { select: () => q, eq: () => q,
      single: async () => ({ data: { id: "user-a", organization_id: "org-a", status: "active" } }),
      order: async () => ({ data: [], error: null }) };
    return q;
  });
  await expect(renderRequest(() => requireCurrentProfile())).rejects.toThrow("REDIRECT:/welcome");
  expect(m.getUser).toHaveBeenCalledTimes(2);
  expect(m.from).toHaveBeenCalledTimes(4);
});

it("does not persist authorization outside a server render", async () => {
  await requireAccount();
  await requireAccount();
  expect(m.getUser).toHaveBeenCalledTimes(2);
});
