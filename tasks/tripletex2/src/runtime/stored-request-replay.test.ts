import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  loadStoredCompetitionRequestFixture,
  replayStoredRequestFixture,
  resolveStoredRequestFixture,
} from "./stored-request-replay";

test("resolveStoredRequestFixture matches stable ids and paths", async () => {
  const byId = await resolveStoredRequestFixture(
    "prod-2026-03-19-202404144Z-b7918145",
  );
  const byRelativePath = await resolveStoredRequestFixture(
    "train_requests/prod-2026-03-19-202404144Z-b7918145.json",
  );
  const byAbsolutePath = await resolveStoredRequestFixture(byId.absolutePath);

  assert.equal(byId.fixtureId, "prod-2026-03-19-202404144Z-b7918145");
  assert.equal(
    byId.relativePath,
    "train_requests/prod-2026-03-19-202404144Z-b7918145.json",
  );
  assert.equal(byRelativePath.absolutePath, byId.absolutePath);
  assert.equal(byAbsolutePath.absolutePath, byId.absolutePath);
});

test("loadStoredCompetitionRequestFixture decodes stored request files", async () => {
  const request = await loadStoredCompetitionRequestFixture(
    "test-2026-03-19-183112872Z-b763b5c7",
  );

  assert.equal(request.prompt, "Read attached invoice and prepare the Tripletex action.");
  assert.equal(request.files.length, 1);
  assert.deepEqual(request.files[0], {
    fileName: "note.txt",
    textContent: "hello tripletex\n",
    contentBase64: Buffer.from("hello tripletex\n").toString("base64"),
    mediaType: "text/plain",
  });
  assert.equal(request.tripletex_credentials.base_url, "https://example.invalid");
  assert.equal(request.tripletex_credentials.session_token, "fixture-replay-token");
});

test("replayStoredRequestFixture runs a stored request through the real pipeline", async (t) => {
  const outputRoot = await mkdtemp(
    path.join(os.tmpdir(), "tripletex2-stored-request-replay-"),
  );
  t.after(async () => {
    await rm(outputRoot, { recursive: true, force: true });
  });

  const now = () => new Date("2026-03-20T21:45:00.000Z");
  const result = await replayStoredRequestFixture({
    fixtureRef: "prod-2026-03-19-202404144Z-b7918145",
    outputRoot,
    now,
  });

  assert.equal(
    result.fixture.relativePath,
    "train_requests/prod-2026-03-19-202404144Z-b7918145.json",
  );
  assert.match(
    path.relative(outputRoot, result.artifactPath),
    /^2026-03-20\/run-replay-2026-03-20T21-45-00-000Z-[a-f0-9]{8}\.json$/,
  );

  const artifact = JSON.parse(await readFile(result.artifactPath, "utf8")) as {
    mode: string;
    task: { taskSource: string };
    request: { promptText?: string; credentialSource?: string };
    input: { source: string };
    execution: {
      runtimeStatus: string;
      apiCallCount: number;
      result?: {
        createdEntityIds?: Record<string, number>;
      };
    };
    analysis?: { notes?: string[] };
  };

  assert.equal(artifact.mode, "replay");
  assert.equal(artifact.task.taskSource, "replay-label");
  assert.equal(
    artifact.request.promptText,
    "Opprett og send en faktura til kunden Nordhav AS (org.nr 876520427) på 7850 kr eksklusiv MVA. Fakturaen gjelder Analyserapport.",
  );
  assert.equal(
    artifact.request.credentialSource,
    "fixture-replay:redacted-train-request-override",
  );
  assert.equal(artifact.input.source, "fixture");
  assert.equal(artifact.execution.runtimeStatus, "completed");
  assert.equal(artifact.execution.apiCallCount, 3);
  assert.deepEqual(artifact.execution.result?.createdEntityIds, {
    customerId: 42,
    invoiceId: 9001,
  });
  assert.deepEqual(artifact.analysis?.notes, [
    'Stored request replay used fixture metadata to label "train_requests/prod-2026-03-19-202404144Z-b7918145.json" as create-and-send-invoice and to provide structured input fields; no classifier/extractor ran.',
    "Stored request credentials are redacted in train_requests/, so this replay uses fixture-scoped Tripletex HTTP responses instead of live network calls.",
    "Deterministic runtime started only after the task-understanding handoff.",
  ]);
});
