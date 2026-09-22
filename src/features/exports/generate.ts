import ExcelJS from "exceljs";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Report, Template } from "@/features/reports/model";
import { reportStatus } from "@/features/reports/model";
import { formatClassDate } from "@/features/classes/dates";

export function exportRows(
  reports: Report[],
  templates: Map<string, Template>,
): string[][] {
  return reports.flatMap((r) => {
    const template = templates.get(r.template_version_id);
    if (!template) throw new Error("보고서 양식이 없습니다.");
    const base = [
      r.class_sessions.title,
      r.class_sessions.location,
      formatClassDate(r.class_sessions.start_at, r.class_sessions.has_time),
      r.class_sessions.has_time === false
        ? ""
        : formatClassDate(r.class_sessions.end_at),
      r.profiles.name,
      reportStatus(r),
      r.class_sessions.status === "cancelled" ? "취소" : "예정",
      formatClassDate(r.created_at),
    ];
    return template.template_fields.map((f) => {
      const value = r.report_answers.find((a) => a.field_id === f.id)?.value;
      const photos = r.report_attachments.filter((a) => a.field_id === f.id);
      const answer =
        f.field_type === "photo"
          ? photos
              .map((a) => a.original_filename + " [" + a.id + "]")
              .join("\n")
          : value == null
            ? ""
            : Array.isArray(value)
              ? value.join(", ")
              : String(value);
      return [...base, f.label, answer];
    });
  });
}
export const HEADERS = [
  "수업명",
  "장소",
  "시작 일시 (한국)",
  "종료 일시 (한국)",
  "작성자",
  "보고 상태",
  "수업 상태",
  "작성 일시 (한국)",
  "질문",
  "답변 / 사진 정보",
];
export async function generateExport(
  format: "pdf" | "xlsx",
  rows: string[][],
): Promise<Uint8Array> {
  if (rows.reduce((n, row) => n + row.join("").length, 0) > 2000000)
    throw new Error("내용이 너무 많습니다. 기간을 좁혀 주세요.");
  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("수업 보고서");
    sheet.addRow(HEADERS);
    rows.forEach((row) => sheet.addRow(row));
    sheet.columns.forEach((column, i) => {
      column.width = i === 9 ? 65 : i === 8 ? 30 : 22;
    });
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "J1" };
    sheet.eachRow((row) => {
      row.alignment = { vertical: "top", wrapText: true };
    });
    return new Uint8Array(await workbook.xlsx.writeBuffer());
  }
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(
    await readFile(
      path.join(process.cwd(), "assets/fonts/NotoSansCJKkr-Regular.otf"),
    ),
    { subset: true },
  );
  const supported = new Set(font.getCharacterSet());
  let page = pdf.addPage([595, 842]),
    y = 790;
  const size = 10,
    lineHeight = 16,
    width = 499;
  const newPage = () => {
    page = pdf.addPage([595, 842]);
    y = 790;
  };
  const draw = (text: string, big = false) => {
    const fontSize = big ? 14 : size;
    for (const paragraph of text
      .replace(/[\u0000-\u0008\u000B-\u001F]/g, "")
      .split("\n")) {
      let line = "";
      for (const c of paragraph) {
        const safe = supported.has(c.codePointAt(0)!) ? c : "?";
        if (font.widthOfTextAtSize(line + safe, fontSize) > width) {
          if (y < 55) newPage();
          page.drawText(line, {
            x: 48,
            y,
            font,
            size: fontSize,
            color: rgb(0, 0, 0),
          });
          y -= lineHeight;
          line = safe;
        } else line += safe;
      }
      if (y < 55) newPage();
      if (line) page.drawText(line, { x: 48, y, font, size: fontSize });
      y -= lineHeight;
    }
  };
  draw("Flag Edu 수업 보고서", true);
  draw("사진은 파일명과 첨부 ID로 표시됩니다. 원본은 앱에서 확인하세요.");
  y -= 12;
  let previous = "";
  for (const row of rows) {
    const group = row.slice(0, 8).join(" · ");
    if (group !== previous) {
      y -= 12;
      draw(`${row[0]} / ${row[4]} / ${row[5]}`, true);
      draw(`${row[1]} | ${row[2]}${row[3] ? " ~ " + row[3] : ""} | ${row[6]}`);
      draw(row[7]);
      previous = group;
    }
    draw(row[8] + ": " + (row[9] || "미입력"));
  }
  pdf.getPages().forEach((p, i) =>
    p.drawText(`${i + 1} / ${pdf.getPageCount()}`, {
      x: 280,
      y: 25,
      font,
      size: 9,
    }),
  );
  return pdf.save();
}
