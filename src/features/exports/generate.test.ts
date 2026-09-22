// @vitest-environment node
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { generateExport, HEADERS } from "./generate";
describe("export file generation", () => {
  const rows = [
    [
      "체육 수업",
      "서울",
      "2026-09-22",
      "2026-09-22",
      "박코치",
      "제출 완료",
      "예정",
      "1",
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
  it("creates a parseable Korean PDF and paginates long answers", async () => {
    const bytes = await generateExport("pdf", [
      ...rows,
      [...rows[0].slice(0, 9), "긴 한국어 보고서입니다. ".repeat(1200)],
    ]);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  }, 30000);
});
