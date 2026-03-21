import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface AttachmentFileLike {
  fileName: string;
  mediaType?: string;
  textContent?: string;
  contentBase64?: string;
}

export interface StagedAttachmentFile<TFile extends AttachmentFileLike = AttachmentFileLike>
  extends TFile {
  path: string;
}

export async function stageAttachmentFiles<TFile extends AttachmentFileLike>(
  runDirectory: string,
  files: readonly TFile[],
): Promise<StagedAttachmentFile<TFile>[]> {
  if (files.length === 0) {
    return [];
  }

  const attachmentsDir = path.join(runDirectory, "attachments");
  await mkdir(attachmentsDir, { recursive: true });

  const stagedFiles: StagedAttachmentFile<TFile>[] = [];
  for (const [index, file] of files.entries()) {
    const storedFileName =
      `${String(index + 1).padStart(2, "0")}-${sanitizeAttachmentFilename(file.fileName)}`;
    const filePath = path.join(attachmentsDir, storedFileName);
    await writeFile(filePath, getAttachmentFileBytes(file));
    stagedFiles.push({
      ...file,
      path: filePath,
    });
  }

  return stagedFiles;
}

export function getAttachmentFileBytes(file: AttachmentFileLike): Uint8Array {
  if (file.contentBase64 !== undefined) {
    return Buffer.from(file.contentBase64, "base64");
  }

  if (file.textContent !== undefined) {
    return Buffer.from(file.textContent, "utf8");
  }

  throw new Error(
    `Attachment "${file.fileName}" did not include contentBase64 or textContent.`,
  );
}

export function normalizeAttachmentTextContent(
  file: AttachmentFileLike,
): string | undefined {
  if (file.contentBase64 === undefined) {
    return file.textContent;
  }

  const bytes = Buffer.from(file.contentBase64, "base64");
  if (!shouldPreserveTextContent(file.mediaType, bytes)) {
    return undefined;
  }

  return file.textContent ?? bytes.toString("utf8");
}

export function sanitizeAttachmentFilename(filename: string): string {
  const cleaned = path.basename(filename).replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned.length > 0 ? cleaned : "attachment";
}

function shouldPreserveTextContent(
  mediaType: string | undefined,
  bytes: Uint8Array,
): boolean {
  if (mediaType) {
    if (isTextualMediaType(mediaType)) {
      return true;
    }

    if (isKnownBinaryMediaType(mediaType)) {
      return false;
    }
  }

  return isLikelyUtf8Text(bytes);
}

function isTextualMediaType(mediaType: string): boolean {
  const normalized = normalizeMediaType(mediaType);
  return (
    normalized.startsWith("text/") ||
    normalized === "application/json" ||
    normalized === "application/xml" ||
    normalized === "application/javascript" ||
    normalized === "application/x-javascript" ||
    normalized === "application/x-ndjson" ||
    normalized === "application/x-www-form-urlencoded" ||
    normalized.endsWith("+json") ||
    normalized.endsWith("+xml")
  );
}

function isKnownBinaryMediaType(mediaType: string): boolean {
  const normalized = normalizeMediaType(mediaType);
  return (
    normalized === "application/pdf" ||
    normalized === "application/octet-stream" ||
    normalized === "application/zip" ||
    normalized === "application/gzip" ||
    normalized === "application/x-gzip" ||
    normalized === "application/x-tar" ||
    normalized.startsWith("audio/") ||
    normalized.startsWith("font/") ||
    normalized.startsWith("image/") ||
    normalized.startsWith("video/")
  );
}

function normalizeMediaType(mediaType: string): string {
  return mediaType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function isLikelyUtf8Text(bytes: Uint8Array): boolean {
  if (bytes.length === 0) {
    return true;
  }

  for (const byte of bytes) {
    if (byte === 0) {
      return false;
    }
  }

  const decoded = Buffer.from(bytes).toString("utf8");
  if (decoded.includes("\uFFFD")) {
    return false;
  }

  if (!Buffer.from(decoded, "utf8").equals(Buffer.from(bytes))) {
    return false;
  }

  for (const character of decoded) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      codePoint < 0x20 &&
      codePoint !== 0x09 &&
      codePoint !== 0x0a &&
      codePoint !== 0x0d
    ) {
      return false;
    }
  }

  return true;
}
