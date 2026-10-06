// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, POST } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  from: vi.fn(),
  reportSelect: vi.fn(),
  reportEq: vi.fn(),
  reportSingle: vi.fn(),
}));

vi.mock("@/features/auth/current-user", () => ({
  requireCurrentProfile: mocks.auth,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const reportId = "10000000-0000-4000-8000-000000000001";
const attachmentId = "20000000-0000-4000-8000-000000000001";
const fieldId = "30000000-0000-4000-8000-000000000001";

function postRequest() {
  const body = new FormData();
  body.set("field", fieldId);
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

function deleteRequest() {
  return new Request(`http://localhost:3000/api/reports/${reportId}/photos`, {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    body: JSON.stringify({ id: attachmentId }),
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
