// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  single: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
  signed: vi.fn(),
}));

vi.mock("@/features/auth/current-user", () => ({
  requireCurrentProfile: mocks.auth,
}));

const id = "10000000-0000-4000-8000-000000000001";
const selectQuery = {
  eq: vi.fn(),
  single: mocks.single,
};
selectQuery.eq.mockReturnValue(selectQuery);
const client = {
  from: () => ({
    select: () => selectQuery,
    update: mocks.update,
  }),
  storage: {
    from: () => ({
      remove: mocks.remove,
      createSignedUrl: mocks.signed,
    }),
  },
};

describe("export download route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectQuery.eq.mockReturnValue(selectQuery);
    mocks.auth.mockResolvedValue({
      profile: { id: "admin", role: "admin" },
      supabase: client,
    });
    mocks.update.mockReturnValue({ eq: vi.fn().mockResolvedValue({}) });
    mocks.remove.mockResolvedValue({ error: null });
    mocks.signed.mockResolvedValue({
      data: { signedUrl: "https://example.test/download" },
    });
  });

  it("returns 410 and removes an expired file", async () => {
    mocks.single.mockResolvedValue({
      data: {
        storage_path: "org/admin/export.pdf",
        format: "pdf",
        expires_at: "2020-01-01T00:00:00.000Z",
      },
    });
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id }),
    });
    expect(response.status).toBe(410);
    expect(mocks.remove).toHaveBeenCalledWith(["org/admin/export.pdf"]);
    expect(mocks.update).toHaveBeenCalledWith({ storage_path: null });
    expect(mocks.signed).not.toHaveBeenCalled();
  });

  it("redirects to a signed URL while the file is retained", async () => {
    mocks.single.mockResolvedValue({
      data: {
        storage_path: "org/admin/export.pdf",
        format: "pdf",
        expires_at: "2999-01-01T00:00:00.000Z",
      },
    });
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id }),
    });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.test/download",
    );
  });
});
