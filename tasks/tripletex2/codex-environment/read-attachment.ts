#!/usr/bin/env bun

import { readFile } from "node:fs/promises";
import path from "node:path";

const attachmentPath = Bun.argv[2];
if (!attachmentPath) {
  throw new Error("Usage: bun read-attachment.ts /absolute/path/to/attachment");
}

const bytes = await readFile(attachmentPath);
if (looksLikePdf(bytes, attachmentPath)) {
  const result = Bun.spawn(["pdftotext", "-layout", "-nopgbrk", attachmentPath, "-"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await result.exited;
  const stdout = await new Response(result.stdout).text();
  const stderr = await new Response(result.stderr).text();

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `pdftotext failed with exit code ${exitCode}.`);
  }

  process.stdout.write(stdout);
  process.exit(0);
}

if (!looksLikeUtf8Text(bytes)) {
  throw new Error(
    `Attachment at ${attachmentPath} is binary and not a supported text/PDF input for read-attachment.ts.`,
  );
}

process.stdout.write(Buffer.from(bytes).toString("utf8"));

function looksLikePdf(bytes: Uint8Array, filePath: string): boolean {
  return (
    path.extname(filePath).toLowerCase() === ".pdf" ||
    (bytes.length >= 4 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46)
  );
}

function looksLikeUtf8Text(bytes: Uint8Array): boolean {
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

  return Buffer.from(decoded, "utf8").equals(Buffer.from(bytes));
}
