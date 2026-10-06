// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  list: vi.fn(),
  template: vi.fn(),
  generate: vi.fn(),
  generatePdf: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  filters: vi.fn(),
  rows: vi.fn(),
}));
vi.mock("@/features/auth/current-user", () => ({
  requireCurrentProfile: mocks.auth,
}));
vi.mock("@/features/reports/repository", () => ({
  listReports: mocks.list,
  getTemplate: mocks.template,
  reportFilters: mocks.filters,
}));
vi.mock("@/features/exports/generate", () => ({
  exportRows: mocks.rows,
  generateExport: mocks.generate,
  generateReportPdf: mocks.generatePdf,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const profile = { id: "admin", organization_id: "org", role: "admin" };
const client = {
  from: () => ({
    insert: mocks.insert,
    update: mocks.update,
  }),
  storage: {
    from: () => ({
      download: mocks.download,
      upload: mocks.upload,
      remove: mocks.remove,
    }),
  },
};
function request(format = "xlsx", origin = "http://localhost:3000") {
  const body = new FormData();
  body.set("format", format);
  return new Request("http://localhost:3000/api/exports", {
    method: "POST",
    headers: { origin },
    body,
  });
}
describe("export API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ profile, supabase: client });
    mocks.filters.mockReturnValue({ page: 1 });
    mocks.list.mockResolvedValue({
      data: [
        { template_version_id: "template", report_attachments: [] },
      ],
      count: 1,
    });
    mocks.template.mockResolvedValue({});
    mocks.rows.mockReturnValue([]);
    mocks.generate.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mocks.generatePdf.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array([4])]) });
    mocks.upload.mockResolvedValue({});
    mocks.remove.mockResolvedValue({});
    mocks.insert.mockReturnValue({
      select: () => ({ single: async () => ({ data: { id: "job" } }) }),
    });
    mocks.update.mockReturnValue({ eq: async () => ({}) });
  });
  it("denies coaches and cross-origin writes", async () => {
    expect((await POST(request("xlsx", "http://evil.test"))).status).toBe(403);
    mocks.auth.mockResolvedValue({
      profile: { ...profile, role: "coach" },
      supabase: client,
    });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("rejects unsupported formats and empty or oversized selections", async () => {
    expect((await POST(request("html"))).status).toBe(400);
    mocks.list.mockResolvedValue({ data: [], count: 0 });
    expect((await POST(request())).status).toBe(400);
    mocks.list.mockResolvedValue({ data: [{}], count: 201 });
    expect((await POST(request())).status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it.each(["xlsx", "pdf"])(
    "downloads and records a completed %s export",
    async (format) => {
      const response = await POST(request(format));
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Disposition")).toContain(
        `.${format}`,
      );
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(
        new Uint8Array([1, 2, 3]),
      );
      expect(mocks.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "completed" }),
      );
      expect(mocks.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          expires_at: expect.any(String),
        }),
      );
    },
  );
  it("rejects PDFs whose stored photos exceed 15MiB", async () => {
    mocks.list.mockResolvedValue({
      data: [
        {
          template_version_id: "template",
          report_attachments: Array.from({ length: 16 }, () => ({
            file_size: 1024 * 1024,
          })),
        },
      ],
      count: 1,
    });
    const response = await POST(request("pdf"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        "PDF에 포함할 사진이 15MiB를 초과합니다. 기간이나 사진 수를 줄여 주세요.",
    });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.generatePdf).not.toHaveBeenCalled();
  });
  it("loads private report photos while generating a PDF", async () => {
    mocks.generatePdf.mockImplementation(async (_reports, _templates, load) => {
      expect(
        await load({ storage_path: "org/report/photo.jpg" }),
      ).toEqual(new Uint8Array([4]));
      return new Uint8Array([1, 2, 3]);
    });
    expect((await POST(request("pdf"))).status).toBe(200);
    expect(mocks.download).toHaveBeenCalledWith("org/report/photo.jpg");
  });
  it("cleans up a failed upload and records failure", async () => {
    mocks.upload.mockResolvedValue({ error: { message: "failed" } });
    expect((await POST(request())).status).toBe(500);
    expect(mocks.remove).toHaveBeenCalledWith(["org/admin/job.xlsx"]);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
  });
});
