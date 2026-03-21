import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  appendTaskUnderstandingToPromptCorpus,
  backfillPromptCorpus,
} from "./prompt-corpus";

test("appendTaskUnderstandingToPromptCorpus writes one JSONL line for resolved task understanding", async (t) => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "tripletex2-prompt-corpus-"),
  );
  const corpusPath = path.join(tempRoot, "data", "prompt-corpus.jsonl");
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const appended = await appendTaskUnderstandingToPromptCorpus({
    corpusPath,
    request: {
      prompt: "Registrer leverandorfakturaen i vedlegget.",
      files: [{ fileName: "invoice.pdf" }],
    },
    result: {
      status: "resolved",
      taskId: "20",
      input: {},
    },
    runId: "sandbox-corpus-run",
    source: "sandbox",
    timestamp: "2026-03-21T16:00:00.000Z",
  });

  assert.equal(appended, true);
  assert.deepEqual(
    JSON.parse(await readFile(corpusPath, "utf8").then((value) => value.trim())),
    {
      taskId: "20",
      txTaskId: "20",
      status: "resolved",
      prompt: "Registrer leverandorfakturaen i vedlegget.",
      files: ["invoice.pdf"],
      runId: "sandbox-corpus-run",
      timestamp: "2026-03-21T16:00:00.000Z",
      source: "sandbox",
    },
  );
});

test("appendTaskUnderstandingToPromptCorpus skips unresolved results without a taskId", async (t) => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "tripletex2-prompt-corpus-"),
  );
  const corpusPath = path.join(tempRoot, "data", "prompt-corpus.jsonl");
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const appended = await appendTaskUnderstandingToPromptCorpus({
    corpusPath,
    request: {
      prompt: "Create and send the invoice.",
      files: [],
    },
    result: {
      status: "unresolved",
      code: "no-task-match",
      message: "No task matched.",
    },
    runId: "sandbox-unresolved-corpus-run",
    source: "sandbox",
    timestamp: "2026-03-21T16:01:00.000Z",
  });

  assert.equal(appended, false);
  await assert.rejects(access(corpusPath));
});

test("backfillPromptCorpus deduplicates by runId across current and legacy production runs", async (t) => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "tripletex2-prompt-corpus-"),
  );
  const currentRunsRoot = path.join(tempRoot, "data", "production", "runs");
  const legacyRunsRoot = path.join(tempRoot, "legacy", "production", "runs");
  const corpusPath = path.join(tempRoot, "data", "prompt-corpus.jsonl");
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  await writeRunFiles(
    path.join(currentRunsRoot, "prod-existing"),
    {
      prompt: "Opprett kunde fra eksisterende kjøring.",
      files: [],
      tripletex_credentials: {},
    },
    {
      tx_task_id: "01",
      generated_at: "2026-03-21T12:00:00.000Z",
    },
  );
  await writeFile(
    corpusPath,
    `${JSON.stringify({
      taskId: "01",
      txTaskId: "01",
      status: "resolved",
      prompt: "Opprett kunde fra eksisterende kjøring.",
      files: [],
      runId: "prod-existing",
      timestamp: "2026-03-21T12:00:00.000Z",
      source: "production",
    })}\n`,
    "utf8",
  );

  await writeRunFiles(
    path.join(currentRunsRoot, "prod-current"),
    {
      schemaVersion: "tripletex2.solve-stage-request.v1",
      createdAt: "2026-03-21T12:04:00.000Z",
      runId: "prod-current",
      request: {
        prompt: "Registrer leverandorfaktura fra PDF.",
        files: [{ fileName: "invoice.pdf" }],
      },
    },
    {
      completedAt: "2026-03-21T12:05:00.000Z",
      taskId: "20",
    },
  );

  await writeRunFiles(
    path.join(legacyRunsRoot, "prod-legacy"),
    {
      prompt: "Opprett og send faktura til kunden.",
      files: [{ filename: "contract.pdf" }],
      tripletex_credentials: {},
    },
    {
      tx_task_id: "08",
      generated_at: "2026-03-20T19:11:13.199Z",
    },
  );

  await writeRunFiles(
    path.join(legacyRunsRoot, "prod-missing-task"),
    {
      prompt: "Dette skal ikke bli med.",
      files: [{ filename: "ignored.pdf" }],
      tripletex_credentials: {},
    },
    {
      generated_at: "2026-03-20T20:00:00.000Z",
    },
  );

  const result = await backfillPromptCorpus({
    corpusPath,
    runRoots: [currentRunsRoot, legacyRunsRoot],
    source: "production",
  });

  assert.deepEqual(result, {
    appendedCount: 2,
    existingRunCount: 1,
    scannedRunCount: 4,
    skippedMissingRequestCount: 0,
    skippedMissingTaskIdCount: 1,
  });

  const lines = (await readFile(corpusPath, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(lines, [
    {
      taskId: "01",
      txTaskId: "01",
      status: "resolved",
      prompt: "Opprett kunde fra eksisterende kjøring.",
      files: [],
      runId: "prod-existing",
      timestamp: "2026-03-21T12:00:00.000Z",
      source: "production",
    },
    {
      taskId: "08",
      txTaskId: "08",
      status: "resolved",
      prompt: "Opprett og send faktura til kunden.",
      files: ["contract.pdf"],
      runId: "prod-legacy",
      timestamp: "2026-03-20T19:11:13.199Z",
      source: "production",
    },
    {
      taskId: "20",
      txTaskId: "20",
      status: "resolved",
      prompt: "Registrer leverandorfaktura fra PDF.",
      files: ["invoice.pdf"],
      runId: "prod-current",
      timestamp: "2026-03-21T12:05:00.000Z",
      source: "production",
    },
  ]);
});

async function writeRunFiles(
  runDir: string,
  requestJson: unknown,
  taskSourceJson: unknown,
): Promise<void> {
  await mkdir(runDir, { recursive: true });
  await writeFile(
    path.join(runDir, "request.json"),
    `${JSON.stringify(requestJson, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(
      runDir,
      isResultLike(taskSourceJson) ? "result.json" : "task-attribution.json",
    ),
    `${JSON.stringify(taskSourceJson, null, 2)}\n`,
    "utf8",
  );
}

function isResultLike(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    "taskId" in (value as Record<string, unknown>)
  );
}
