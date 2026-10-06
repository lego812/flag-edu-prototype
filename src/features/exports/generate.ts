import ExcelJS from "exceljs";
import {
  PDFDocument,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  rgb,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  Attachment,
  Report,
  Template,
} from "@/features/reports/model";
import { reportStatus } from "@/features/reports/model";
import { formatClassDate } from "@/features/classes/dates";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 48;
const TOP = 790;
const BOTTOM = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const LABEL_WIDTH = 106;
const VALUE_WIDTH = CONTENT_WIDTH - LABEL_WIDTH;
const TEXT_SIZE = 9;
const LINE_HEIGHT = 14;
const PHOTO_COLUMNS = 1;
const PHOTO_CELL_HEIGHT = 220;
const BORDER = rgb(0.65, 0.65, 0.65);
const LABEL_FILL = rgb(0.965, 0.965, 0.965);

export type PhotoLoader = (
  attachment: Attachment,
) => Promise<Uint8Array | null>;

export function exportRows(
  reports: Report[],
  templates: Map<string, Template>,
): string[][] {
  return reports.flatMap((report) => {
    const template = templates.get(report.template_version_id);
    if (!template) throw new Error("보고서 양식이 없습니다.");
    const base = [
      report.class_sessions.title,
      report.class_sessions.location,
      formatClassDate(
        report.class_sessions.start_at,
        report.class_sessions.has_time,
      ),
      report.class_sessions.has_time === false
        ? ""
        : formatClassDate(report.class_sessions.end_at),
      report.profiles.name,
      reportStatus(report),
      report.class_sessions.status === "cancelled" ? "취소" : "예정",
      formatClassDate(report.created_at),
    ];
    return template.template_fields.map((field) => {
      const value = report.report_answers.find(
        (answer) => answer.field_id === field.id,
      )?.value;
      const photos = report.report_attachments.filter(
        (attachment) => attachment.field_id === field.id,
      );
      const answer =
        field.field_type === "photo"
          ? photos
              .map(
                (attachment) =>
                  attachment.original_filename + " [" + attachment.id + "]",
              )
              .join("\n")
          : answerText(value);
      return [...base, field.label, answer];
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

function assertSafeSize(rows: string[][]) {
  if (rows.reduce((n, row) => n + row.join("").length, 0) > 2_000_000)
    throw new Error("내용이 너무 많습니다. 기간을 좁혀 주세요.");
}

export async function generateExport(
  format: "xlsx",
  rows: string[][],
): Promise<Uint8Array> {
  if (format !== "xlsx") throw new Error("지원하지 않는 내보내기 형식입니다.");
  assertSafeSize(rows);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("수업 보고서");
  sheet.addRow(HEADERS);
  rows.forEach((row) => sheet.addRow(row));
  sheet.columns.forEach((column, index) => {
    column.width = index === 9 ? 65 : index === 8 ? 30 : 22;
  });
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "J1" };
  sheet.eachRow((row) => {
    row.alignment = { vertical: "top", wrapText: true };
  });
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function answerText(value: unknown) {
  if (value == null || value === "") return "";
  return Array.isArray(value) ? value.join(", ") : String(value);
}

function cleanText(text: string, supported: Set<number>) {
  return Array.from(text.replace(/[\u0000-\u0008\u000B-\u001F]/g, ""))
    .map((character) =>
      supported.has(character.codePointAt(0)!) ? character : "?",
    )
    .join("");
}

function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const character of paragraph) {
      if (line && font.widthOfTextAtSize(line + character, size) > width) {
        lines.push(line);
        line = character;
      } else {
        line += character;
      }
    }
    lines.push(line);
  }
  return lines.length ? lines : [""];
}

function drawLines(
  page: PDFPage,
  lines: string[],
  x: number,
  top: number,
  font: PDFFont,
  size = TEXT_SIZE,
) {
  lines.forEach((line, index) => {
    if (line)
      page.drawText(line, {
        x,
        y: top - size - index * LINE_HEIGHT,
        font,
        size,
        color: rgb(0.08, 0.08, 0.08),
      });
  });
}

function drawTableRow(
  page: PDFPage,
  y: number,
  height: number,
  label: string,
  valueLines: string[],
  font: PDFFont,
) {
  page.drawRectangle({
    x: MARGIN_X,
    y: y - height,
    width: LABEL_WIDTH,
    height,
    color: LABEL_FILL,
    borderColor: BORDER,
    borderWidth: 0.65,
  });
  page.drawRectangle({
    x: MARGIN_X + LABEL_WIDTH,
    y: y - height,
    width: VALUE_WIDTH,
    height,
    borderColor: BORDER,
    borderWidth: 0.65,
  });
  const labelLines = wrapText(label, font, TEXT_SIZE, LABEL_WIDTH - 16);
  const labelTop =
    y - Math.max(8, (height - labelLines.length * LINE_HEIGHT) / 2);
  drawLines(page, labelLines, MARGIN_X + 8, labelTop, font);
  drawLines(
    page,
    valueLines,
    MARGIN_X + LABEL_WIDTH + 8,
    y - 8,
    font,
  );
}

function drawReportHeading(
  page: PDFPage,
  title: string,
  font: PDFFont,
  continuation = false,
) {
  page.drawRectangle({ x: MARGIN_X, y: TOP - 3, width: 6, height: 6 });
  page.drawText(continuation ? `${title} - 계속` : title, {
    x: MARGIN_X + 14,
    y: TOP - 7,
    font,
    size: 14,
  });
  return TOP - 28;
}

function drawPhotoGrid(
  page: PDFPage,
  y: number,
  height: number,
  label: string,
  items: { image: PDFImage | null }[],
  font: PDFFont,
) {
  page.drawRectangle({
    x: MARGIN_X,
    y: y - height,
    width: LABEL_WIDTH,
    height,
    color: LABEL_FILL,
    borderColor: BORDER,
    borderWidth: 0.65,
  });
  const labelLines = wrapText(label, font, TEXT_SIZE, LABEL_WIDTH - 16);
  const labelTop =
    y - Math.max(8, (height - labelLines.length * LINE_HEIGHT) / 2);
  drawLines(page, labelLines, MARGIN_X + 8, labelTop, font);

  const cellWidth = VALUE_WIDTH / PHOTO_COLUMNS;
  const rows = Math.max(1, Math.ceil(items.length / PHOTO_COLUMNS));
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < PHOTO_COLUMNS; column += 1) {
      const x = MARGIN_X + LABEL_WIDTH + column * cellWidth;
      const cellY = y - (row + 1) * PHOTO_CELL_HEIGHT;
      page.drawRectangle({
        x,
        y: cellY,
        width: cellWidth,
        height: PHOTO_CELL_HEIGHT,
        borderColor: BORDER,
        borderWidth: 0.65,
      });
      const item = items[row * PHOTO_COLUMNS + column];
      if (!item) continue;
      if (!item.image) {
        const errorLines = wrapText(
          "사진을 불러오지 못했습니다.",
          font,
          7.5,
          cellWidth - 12,
        );
        drawLines(
          page,
          errorLines,
          x + 6,
          cellY + PHOTO_CELL_HEIGHT / 2 + 8,
          font,
          7.5,
        );
        continue;
      }
      const maxWidth = cellWidth - 10;
      const maxHeight = PHOTO_CELL_HEIGHT - 10;
      const scale = Math.min(
        maxWidth / item.image.width,
        maxHeight / item.image.height,
      );
      const width = item.image.width * scale;
      const imageHeight = item.image.height * scale;
      page.drawImage(item.image, {
        x: x + (cellWidth - width) / 2,
        y: cellY + (PHOTO_CELL_HEIGHT - imageHeight) / 2,
        width,
        height: imageHeight,
      });
    }
  }
}

async function embedPhotos(
  pdf: PDFDocument,
  attachments: Attachment[],
  loadPhoto: PhotoLoader,
) {
  const embedded: { image: PDFImage | null }[] = [];
  for (const attachment of attachments) {
    try {
      const bytes = await loadPhoto(attachment);
      embedded.push({ image: bytes ? await pdf.embedJpg(bytes) : null });
    } catch {
      embedded.push({ image: null });
    }
  }
  return embedded;
}

export async function generateReportPdf(
  reports: Report[],
  templates: Map<string, Template>,
  loadPhoto: PhotoLoader,
): Promise<Uint8Array> {
  assertSafeSize(exportRows(reports, templates));
  if (!reports.length) throw new Error("내보낼 보고서가 없습니다.");

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(
    await readFile(
      path.join(process.cwd(), "assets/fonts/NanumGothic-Regular.ttf"),
    ),
    { subset: false },
  );
  const supported = new Set(font.getCharacterSet());

  for (const report of reports) {
    const template = templates.get(report.template_version_id);
    if (!template) throw new Error("보고서 양식이 없습니다.");
    let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = drawReportHeading(
      page,
      cleanText(template.name || "수업 보고서", supported),
      font,
    );

    const nextPage = () => {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = drawReportHeading(
        page,
        cleanText(report.class_sessions.title, supported),
        font,
        true,
      );
    };

    const metadata = [
      ["자료명", report.class_sessions.title],
      [
        "수업 일시",
        report.class_sessions.has_time === false
          ? formatClassDate(report.class_sessions.start_at, false)
          : `${formatClassDate(report.class_sessions.start_at)} ~ ${formatClassDate(report.class_sessions.end_at)}`,
      ],
      ["활동 장소", report.class_sessions.location || "-"],
      ["작성자", report.profiles.name],
      ["작성 일시", formatClassDate(report.created_at)],
    ];
    for (const [label, value] of metadata) {
      const lines = wrapText(
        cleanText(value, supported),
        font,
        TEXT_SIZE,
        VALUE_WIDTH - 16,
      );
      const height = Math.max(32, lines.length * LINE_HEIGHT + 14);
      drawTableRow(
        page,
        y,
        height,
        cleanText(label, supported),
        lines,
        font,
      );
      y -= height;
    }

    for (const field of template.template_fields) {
      const label = cleanText(field.label, supported);
      if (field.field_type === "photo") {
        const attachments = report.report_attachments.filter(
          (attachment) => attachment.field_id === field.id,
        );
        if (!attachments.length) {
          if (y - 34 < BOTTOM) nextPage();
          drawTableRow(page, y, 34, label, ["미첨부"], font);
          y -= 34;
          continue;
        }
        const items = await embedPhotos(pdf, attachments, loadPhoto);
        let offset = 0;
        let continuation = false;
        while (offset < items.length) {
          const availableRows = Math.floor((y - BOTTOM) / PHOTO_CELL_HEIGHT);
          if (availableRows < 1) {
            nextPage();
            continue;
          }
          const itemCount = Math.min(
            items.length - offset,
            availableRows * PHOTO_COLUMNS,
          );
          const chunk = items.slice(offset, offset + itemCount);
          const height =
            Math.ceil(chunk.length / PHOTO_COLUMNS) * PHOTO_CELL_HEIGHT;
          drawPhotoGrid(
            page,
            y,
            height,
            continuation ? `${label} (계속)` : label,
            chunk,
            font,
          );
          y -= height;
          offset += itemCount;
          continuation = true;
          if (offset < items.length) nextPage();
        }
        continue;
      }

      const value = report.report_answers.find(
        (answer) => answer.field_id === field.id,
      )?.value;
      const text = cleanText(answerText(value) || "미입력", supported);
      let lines = wrapText(text, font, TEXT_SIZE, VALUE_WIDTH - 16);
      let continuation = false;
      while (lines.length) {
        const minimumHeight = field.field_type === "long_text" ? 88 : 34;
        const desiredHeight = Math.max(
          minimumHeight,
          lines.length * LINE_HEIGHT + 14,
        );
        if (desiredHeight <= y - BOTTOM) {
          drawTableRow(
            page,
            y,
            desiredHeight,
            continuation ? `${label} (계속)` : label,
            lines,
            font,
          );
          y -= desiredHeight;
          lines = [];
          continue;
        }
        if (y - BOTTOM < minimumHeight) {
          nextPage();
          continue;
        }
        const maxLines = Math.floor((y - BOTTOM - 14) / LINE_HEIGHT);
        if (maxLines < 2) {
          nextPage();
          continue;
        }
        const chunk = lines.slice(0, maxLines);
        const height = Math.max(minimumHeight, chunk.length * LINE_HEIGHT + 14);
        drawTableRow(
          page,
          y,
          height,
          continuation ? `${label} (계속)` : label,
          chunk,
          font,
        );
        y -= height;
        lines = lines.slice(maxLines);
        continuation = true;
        if (lines.length) nextPage();
      }
    }
  }

  pdf.getPages().forEach((page, index) => {
    const text = `${index + 1} / ${pdf.getPageCount()}`;
    page.drawText(text, {
      x: (PAGE_WIDTH - font.widthOfTextAtSize(text, 8)) / 2,
      y: 24,
      font,
      size: 8,
      color: rgb(0.35, 0.35, 0.35),
    });
  });
  return pdf.save();
}
