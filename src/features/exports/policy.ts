import type { Report } from "@/features/reports/model";

export const EXPORT_RETENTION_DAYS = 7;
export const MAX_PDF_PHOTO_BYTES = 15 * 1024 * 1024;

export function exportExpiresAt(now = Date.now()) {
  return new Date(
    now + EXPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
}

export function totalPhotoBytes(reports: Report[]) {
  return reports.reduce(
    (total, report) =>
      total +
      report.report_attachments.reduce(
        (reportTotal, attachment) =>
          reportTotal + Math.max(0, attachment.file_size ?? 0),
        0,
      ),
    0,
  );
}

export function isExportExpired(
  expiresAt: string | null | undefined,
  now = Date.now(),
) {
  return Boolean(expiresAt && new Date(expiresAt).getTime() <= now);
}
