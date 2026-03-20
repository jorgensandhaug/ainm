import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  RUN_ARTIFACT_SCHEMA_VERSION,
  RUN_SIDECAR_SCHEMA_VERSION,
  type RunArtifactV1,
} from "./contracts";
import {
  enrichCanonicalRunArtifact,
  writeCanonicalRunArtifact,
} from "./run-artifact-writer";

test("writeCanonicalRunArtifact writes one canonical artifact with linked sidecars", async (t) => {
  const outputRoot = await mkdtemp(
    path.join(os.tmpdir(), "tripletex2-run-writer-"),
  );
  t.after(async () => {
    await rm(outputRoot, { recursive: true, force: true });
  });

  const result = await writeCanonicalRunArtifact({
    outputRoot,
    artifact: createArtifact(),
    sidecars: [
      {
        sidecarId: "attrib-1",
        kind: "attribution-evidence",
        attachTo: "attribution",
        payload: {
          summary: "Sanitized leaderboard diff snapshot.",
          evidence: {
            leaderboardDiffFingerprint: "lb-diff:1234",
            notes: ["One matching diff row."],
          },
        },
      },
      {
        sidecarId: "score-1",
        kind: "evaluation-evidence",
        attachTo: "evaluation",
        payload: {
          summary: "Sanitized score evidence.",
          evidence: {
            leaderboardEntryFingerprint: "score:entry:abcd",
            notes: ["Competition UI score matched the submission row."],
          },
        },
      },
    ],
  });

  assert.equal(
    path.relative(outputRoot, result.artifactPath),
    path.join("2026-03-20", "run-sample-run.json"),
  );
  assert.equal(result.sidecars.length, 2);

  const artifact = JSON.parse(
    await readFile(result.artifactPath, "utf8"),
  ) as RunArtifactV1;
  assert.equal(artifact.schemaVersion, RUN_ARTIFACT_SCHEMA_VERSION);
  assert.deepEqual(artifact.attribution?.evidenceSidecarIds, ["attrib-1"]);
  assert.deepEqual(artifact.evaluation?.evidenceSidecarIds, ["score-1"]);
  assert.deepEqual(
    artifact.sidecars?.map((sidecar) => sidecar.path),
    ["run-sample-run.attribution.json", "run-sample-run.evaluation.json"],
  );

  const attributionSidecar = JSON.parse(
    await readFile(
      path.join(result.artifactDirectory, "run-sample-run.attribution.json"),
      "utf8",
    ),
  ) as {
    schemaVersion: string;
    payload: { summary: string };
  };
  assert.equal(attributionSidecar.schemaVersion, RUN_SIDECAR_SCHEMA_VERSION);
  assert.equal(
    attributionSidecar.payload.summary,
    "Sanitized leaderboard diff snapshot.",
  );
});

test("writeCanonicalRunArtifact disambiguates duplicate sidecar kinds", async (t) => {
  const outputRoot = await mkdtemp(
    path.join(os.tmpdir(), "tripletex2-run-writer-"),
  );
  t.after(async () => {
    await rm(outputRoot, { recursive: true, force: true });
  });

  const result = await writeCanonicalRunArtifact({
    outputRoot,
    artifact: createArtifact({ runId: "sample-duplicate-sidecars" }),
    sidecars: [
      {
        sidecarId: "reflection-1",
        kind: "reflection-summary",
        payload: {
          summary: "First reflection.",
        },
      },
      {
        sidecarId: "reflection-2",
        kind: "reflection-summary",
        payload: {
          summary: "Second reflection.",
        },
      },
    ],
  });

  assert.deepEqual(
    result.sidecars.map((sidecar) => path.basename(sidecar.path)),
    [
      "run-sample-duplicate-sidecars.reflection.json",
      "run-sample-duplicate-sidecars.reflection-reflection-2.json",
    ],
  );
});

test("writeCanonicalRunArtifact rejects unsafe secret-bearing payloads", async (t) => {
  const outputRoot = await mkdtemp(
    path.join(os.tmpdir(), "tripletex2-run-writer-"),
  );
  t.after(async () => {
    await rm(outputRoot, { recursive: true, force: true });
  });

  await assert.rejects(
    () =>
      writeCanonicalRunArtifact({
        outputRoot,
        artifact: createArtifact(),
        sidecars: [
          {
            sidecarId: "trace-1",
            kind: "sanitized-trace",
            payload: {
              sessionToken: "should-not-be-written",
            },
          },
        ],
      }),
    /unsafe secret-bearing key "sessionToken"/,
  );
});

test("writeCanonicalRunArtifact rejects missing evidence sidecar references and overwrites", async (t) => {
  const outputRoot = await mkdtemp(
    path.join(os.tmpdir(), "tripletex2-run-writer-"),
  );
  t.after(async () => {
    await rm(outputRoot, { recursive: true, force: true });
  });

  await assert.rejects(
    () =>
      writeCanonicalRunArtifact({
        outputRoot,
        artifact: createArtifact({
          attribution: {
            status: "matched",
            attributedTaskId: "create-and-send-invoice",
            source: "leaderboard-diff",
            confidence: "high",
            taskIdMatchesDeclared: true,
            evidenceSidecarIds: ["attrib-1"],
          },
        }),
      }),
    /references unknown sidecarId "attrib-1"/,
  );

  await writeCanonicalRunArtifact({
    outputRoot,
    artifact: createArtifact({ runId: "sample-no-overwrite" }),
  });

  await assert.rejects(
    () =>
      writeCanonicalRunArtifact({
        outputRoot,
        artifact: createArtifact({ runId: "sample-no-overwrite" }),
      }),
    /Refusing to overwrite existing run artifact file/,
  );
});

test("enrichCanonicalRunArtifact only updates enrichment sections and appends sidecars", async (t) => {
  const outputRoot = await mkdtemp(
    path.join(os.tmpdir(), "tripletex2-run-writer-"),
  );
  t.after(async () => {
    await rm(outputRoot, { recursive: true, force: true });
  });

  const initial = await writeCanonicalRunArtifact({
    outputRoot,
    artifact: createArtifact({ runId: "sample-enrichment" }),
  });

  const enriched = await enrichCanonicalRunArtifact({
    artifactPath: initial.artifactPath,
    evaluation: {
      status: "not-available",
      rawNotes: ["Waiting for later sandbox attribution/evaluation."],
    },
    sidecars: [
      {
        sidecarId: "reflection-1",
        kind: "reflection-summary",
        payload: {
          summary: "No scoring yet; artifact kept append-only.",
        },
      },
    ],
  });

  assert.equal(enriched.artifact.runId, "sample-enrichment");
  assert.equal(enriched.artifact.execution.runtimeStatus, "completed");
  assert.equal(enriched.artifact.evaluation?.status, "not-available");
  assert.deepEqual(enriched.artifact.evaluation?.rawNotes, [
    "Waiting for later sandbox attribution/evaluation.",
  ]);
  assert.deepEqual(
    enriched.artifact.sidecars?.map((sidecar) => sidecar.sidecarId),
    ["reflection-1"],
  );
});

function createArtifact(
  overrides: Partial<RunArtifactV1> = {},
): RunArtifactV1 {
  return {
    schemaVersion: RUN_ARTIFACT_SCHEMA_VERSION,
    runId: "sample-run",
    createdAt: "2026-03-20T20:30:00Z",
    mode: "sandbox",
    task: {
      taskId: "create-and-send-invoice",
      taskName: "Create and send invoice",
      taskConfidence: "high",
      taskSource: "manual-label",
    },
    strategy: {
      strategyId: "create-and-send-invoice.order-then-send",
      strategyName: "Order then send",
      strategyPath:
        "src/tasks/task-create-and-send-invoice/strategies/order-then-invoice-send.ts",
      strategyStatus: "active",
    },
    selection: {
      selectionConfigId: "active-strategies-2026-03-20-a",
      selectionConfigPath: "configs/active-strategies.json",
    },
    request: {
      requestFingerprint: "req:1234",
      promptSummary: "Create and send an invoice for an existing customer.",
      files: [],
      credentialSource: "tripletex-proxy",
    },
    input: {
      inputSchemaId: "create-and-send-invoice.v1",
      status: "resolved",
      source: "manual",
      confidence: "high",
      value: {
        amountNokExcludingVat: 28500,
        customerOrganizationNumber: "841254546",
      },
    },
    execution: {
      startedAt: "2026-03-20T20:30:01Z",
      completedAt: "2026-03-20T20:30:03Z",
      durationMs: 2000,
      deadlineMs: 300000,
      runtimeStatus: "completed",
      apiCallCount: 1,
      api4xxCount: 0,
      api5xxCount: 0,
      apiCalls: [
        {
          index: 1,
          method: "POST",
          path: "/order",
          requestSummary: "Create the sales order.",
          responseSummary: "Created order 4321.",
          status: 200,
          entityIds: {
            orderId: 4321,
          },
        },
      ],
      result: {
        createdEntityIds: {
          invoiceId: 9876,
          orderId: 4321,
        },
      },
    },
    attribution: {
      status: "matched",
      attributedTaskId: "create-and-send-invoice",
      source: "leaderboard-diff",
      confidence: "high",
      taskIdMatchesDeclared: true,
      evidence: {
        leaderboardDiffFingerprint: "lb-diff:1234",
      },
    },
    evaluation: {
      status: "scored",
      observedAt: "2026-03-20T20:35:00Z",
      source: "competition-ui",
      scoreTotal: 2,
      correctnessScore: 1,
      tier: 2,
      taskSolved: true,
      evidence: {
        leaderboardEntryFingerprint: "score:entry:abcd",
      },
    },
    analysis: {
      notes: ["Smoke-test artifact."],
      hypothesisCheck: "supported",
    },
    ...overrides,
  };
}
