// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import {
  exportRows,
  generateExport,
  generateReportPdf,
  HEADERS,
} from "./generate";
import type { Report, Template } from "@/features/reports/model";
describe("export file generation", () => {
  const rows = [
    [
      "체육 수업",
      "서울",
      "2026-09-22",
      "2026-09-22",
      "박코치",
      "제출",
      "예정",
      "2026.09.22 10:30",
      "활동 내용",
      '=HYPERLINK("https://example.com")',
    ],
  ];
  it("creates XLSX with literal answers, not executable formulas", async () => {
    const bytes = await generateExport("xlsx", rows);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as never);
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(1).getCell(1).value).toBe(HEADERS[0]);
    expect(sheet.getRow(2).getCell(10).value).toBe(rows[0][9]);
  });
  it("exports dates, zero counts and photo references without approval labels", () => {
    const report = {
      template_version_id: "template",
      status: "submitted",
      confirmed_at: "2026-09-23T00:00:00Z",
      created_at: "2026-09-23T00:00:00Z",
      profiles: { name: "홍길동" },
      class_sessions: {
        title: "체육",
        location: "센터",
        start_at: "2026-09-22T15:00:00Z",
        end_at: "2026-09-23T15:00:00Z",
        has_time: false,
        status: "scheduled",
      },
      report_answers: [{ field_id: "count", value: 0 }],
      report_attachments: [
        { id: "photo-id", field_id: "photo", original_filename: "photo.jpg" },
      ],
    } as Report;
    const template = {
      id: "template",
      template_fields: [
        { id: "count", label: "인원", field_type: "number" },
        { id: "photo", label: "사진", field_type: "photo" },
      ],
    } as Template;
    const result = exportRows([report], new Map([["template", template]]));
    expect(result[0][3]).toBe("");
    expect(result[0][5]).toBe("제출");
    expect(result[0][9]).toBe("0");
    expect(result[1][9]).toBe("photo.jpg [photo-id]");
    expect(result.flat().join(" ")).not.toContain("확인 완료");
  });
  it("rejects exports exceeding the safe text size", async () => {
    await expect(
      generateExport("xlsx", [["x".repeat(2000001)]]),
    ).rejects.toThrow("너무 많습니다");
  });
  it("creates typed rows, embeds photos and paginates long answers", async () => {
    const template = {
      id: "template",
      name: "친구와 함께 보는 수업 결과",
      template_fields: [
        { id: "short", label: "참여 인원", field_type: "number" },
        { id: "photo", label: "활동 사진", field_type: "photo" },
        { id: "long", label: "활동에 대한 의견", field_type: "long_text" },
      ],
    } as Template;
    const report = {
      id: "report",
      template_version_id: "template",
      status: "submitted",
      created_at: "2026-09-23T00:00:00Z",
      profiles: { name: "홍길동" },
      class_sessions: {
        title: "Book-스토리텔링",
        location: "활동 학교",
        start_at: "2026-09-22T01:00:00Z",
        end_at: "2026-09-22T02:00:00Z",
        has_time: true,
        status: "scheduled",
      },
      report_answers: [
        { field_id: "short", value: 8 },
        {
          field_id: "long",
          value: "긴 한국어 보고서입니다. ".repeat(1200),
        },
      ],
      report_attachments: [
        {
          id: "photo-id",
          field_id: "photo",
          storage_path: "org/report/photo.jpg",
          original_filename: "photo.jpg",
        },
      ],
    } as Report;
    const jpeg = Uint8Array.from(
      Buffer.from(
        "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==",
        "base64",
      ),
    );
    const loadPhoto = vi.fn().mockResolvedValue(jpeg);
    const bytes = await generateReportPdf(
      [report],
      new Map([["template", template]]),
      loadPhoto,
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(loadPhoto).toHaveBeenCalledWith(report.report_attachments[0]);
  }, 30000);
});
