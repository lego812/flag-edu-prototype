// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Report } from "@/features/reports/model";
import {
  EXPORT_RETENTION_DAYS,
  exportExpiresAt,
  isExportExpired,
  totalPhotoBytes,
} from "./policy";

describe("export policy", () => {
  it("expires generated files after seven days", () => {
    const now = Date.parse("2026-10-06T00:00:00Z");
    expect(EXPORT_RETENTION_DAYS).toBe(7);
    expect(exportExpiresAt(now)).toBe("2026-10-13T00:00:00.000Z");
    expect(isExportExpired("2026-10-13T00:00:00.000Z", now)).toBe(false);
    expect(
      isExportExpired("2026-10-13T00:00:00.000Z", now + 7 * 86400000),
    ).toBe(true);
  });

  it("adds the stored byte size of every report photo", () => {
    const reports = [
      {
        report_attachments: [
          { file_size: 1024 },
          { file_size: 2048 },
          { file_size: undefined },
        ],
      },
    ] as Report[];
    expect(totalPhotoBytes(reports)).toBe(3072);
  });
});
