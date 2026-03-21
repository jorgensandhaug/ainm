#!/usr/bin/env bun

import { readFile, stat } from "node:fs/promises";

const callbackUrl = process.env.TRIPLETEX2_CLASSIFY_CALLBACK_URL;
if (!callbackUrl) {
  throw new Error("TRIPLETEX2_CLASSIFY_CALLBACK_URL is not set.");
}

const input = Bun.argv[2];
if (!input) {
  throw new Error(
    "Usage: bun submit-classification.ts '<json>' or bun submit-classification.ts /path/to/result.json",
  );
}

const payload = await resolvePayload(input);
JSON.parse(payload);

const response = await fetch(callbackUrl, {
  method: "POST",
  headers: {
    "content-type": "application/json",
  },
  body: payload,
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(
    `Classification callback failed with ${response.status}: ${body || response.statusText}`,
  );
}

async function resolvePayload(inputValue: string): Promise<string> {
  if (await pathExists(inputValue)) {
    return await readFile(inputValue, "utf8");
  }

  return inputValue;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile();
  } catch {
    return false;
  }
}
