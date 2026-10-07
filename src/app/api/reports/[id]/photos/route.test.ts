// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, POST } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  from: vi.fn(),
  reportSelect: vi.fn(),
  reportEq: vi.fn(),
  reportSingle: vi.fn(),
  rpc: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  signed: vi.fn(),
}));

vi.mock("@/features/auth/current-user", () => ({
  requireCurrentProfile: mocks.auth,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const reportId = "10000000-0000-4000-8000-000000000001";
const attachmentId = "20000000-0000-4000-8000-000000000001";
const fieldId = "30000000-0000-4000-8000-000000000001";

function postRequest(version = "2026-10-07T00:00:00Z") {
  const body = new FormData();
  body.set("field", fieldId);
  body.set("version", version);
  body.set(
    "file",
    new File([new Uint8Array([255, 216, 255, 217])], "photo.jpg", {
      type: "image/jpeg",
    }),
  );
  return new Request(`http://localhost:3000/api/reports/${reportId}/photos`, {
    method: "POST",
    headers: { origin: "http://localhost:3000" },
    body,
  });
}

function deleteRequest(version = "2026-10-07T00:00:00Z") {
  return new Request(`http://localhost:3000/api/reports/${reportId}/photos`, {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    body: JSON.stringify({ id: attachmentId, version }),
  });
}

describe("cancelled report photo API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const query = {
      select: mocks.reportSelect,
      eq: mocks.reportEq,
      single: mocks.reportSingle,
    };
    mocks.reportSelect.mockReturnValue(query);
    mocks.reportEq.mockReturnValue(query);
    mocks.reportSingle.mockResolvedValue({
      data: {
        id: reportId,
        template_version_id: "template",
        class_sessions: { status: "cancelled" },
      },
    });
    mocks.from.mockReturnValue(query);
    mocks.auth.mockResolvedValue({
      profile: { id: "coach", organization_id: "organization" },
      supabase: { from: mocks.from },
    });
  });

  it("rejects photo uploads before storage is mutated", async () => {
    const response = await POST(postRequest(), {
      params: Promise.resolve({ id: reportId }),
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "취소된 수업의 보고서는 변경할 수 없습니다.",
    });
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it("rejects photo deletion before reading the attachment", async () => {
    const response = await DELETE(deleteRequest(), {
      params: Promise.resolve({ id: reportId }),
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "취소된 수업의 보고서는 변경할 수 없습니다.",
    });
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
});

describe("atomic photo mutation revision contract", () => {
  const version = "2026-10-07T00:00:01Z";
  const path = `organization/${reportId}/photo.jpg`;
  beforeEach(() => {
    vi.clearAllMocks();
    const query = { select: mocks.reportSelect, eq: mocks.reportEq, single: mocks.reportSingle };
    mocks.reportSelect.mockReturnValue(query);
    mocks.reportEq.mockReturnValue(query);
    mocks.reportSingle.mockResolvedValue({ data: { id: reportId, template_version_id: "template", class_sessions: { status: "scheduled" } } });
    mocks.from.mockReturnValue(query);
    mocks.upload.mockResolvedValue({ error: null });
    mocks.remove.mockResolvedValue({ error: null });
    mocks.signed.mockResolvedValue({ data: { signedUrl: "https://example.com/private-photo" } });
    mocks.rpc.mockResolvedValue({ data: { attachment: { id: attachmentId, storage_path: path }, version } });
    mocks.auth.mockResolvedValue({
      profile: { id: "coach", organization_id: "organization", role: "coach" },
      supabase: {
        from: mocks.from, rpc: mocks.rpc,
        storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove, createSignedUrl: mocks.signed }) },
      },
    });
  });

  it("forwards the seen upload revision and returns only the transaction's new revision", async () => {
    const response = await POST(postRequest(), { params: Promise.resolve({ id: reportId }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ version, attachment: { id: attachmentId } });
    expect(mocks.rpc).toHaveBeenCalledWith("mutate_report_photo", expect.objectContaining({ p_report_id: reportId, p_operation: "insert", p_version: "2026-10-07T00:00:00Z" }));
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("cleans up an uploaded orphan on stale revision and responds promptly with 409", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "PT409", message: "Report changed; reload" }, data: null });
    const response = await POST(postRequest(), { params: Promise.resolve({ id: reportId }) });
    expect(response.status).toBe(409);
    expect(mocks.remove).toHaveBeenCalledWith([expect.stringMatching(new RegExp(`^organization/${reportId}/`))]);
    const result = await response.json();
    expect(result.error).toContain("변경됐습니다");
    expect(result).not.toHaveProperty("version");
  });

  it("returns the atomic delete revision after removing the corresponding storage object", async () => {
    const response = await DELETE(deleteRequest(), { params: Promise.resolve({ id: reportId }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, version });
    expect(mocks.rpc).toHaveBeenCalledWith("mutate_report_photo", { p_report_id: reportId, p_version: "2026-10-07T00:00:00Z", p_operation: "delete", p_attachment: { id: attachmentId } });
    expect(mocks.remove).toHaveBeenCalledWith([path]);
  });

  it("does not remove storage or return another writer's revision on delete conflict", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "PT409" }, data: null });
    const response = await DELETE(deleteRequest(), { params: Promise.resolve({ id: reportId }) });
    expect(response.status).toBe(409);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(await response.json()).not.toHaveProperty("version");
  });
});
