import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type {
  TaskUnderstandingResolved,
  TripletexFetch,
  TripletexFetchResponse,
} from "./contracts";
import { runCompetitionSolvePipeline } from "./solve-pipeline";

test("runCompetitionSolvePipeline executes the pinned strategy and writes canonical plus staging lineage", async (t) => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "tripletex2-solve-pipeline-"),
  );
  const artifactRoot = path.join(tempRoot, "runs");
  const stageDirectory = path.join(
    tempRoot,
    "data",
    "sandbox",
    "runs",
    "sandbox-fixed-run",
  );
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const now = createFrozenNow("2026-03-20T21:10:15.000Z");
  const result = await runCompetitionSolvePipeline(
    {
      prompt:
        "Opprett og send en faktura til kunden Nordhav AS (org.nr 876520427) på 7850 kr eksklusiv MVA. Fakturaen gjelder Analyserapport.",
      files: [],
      tripletex_credentials: {
        base_url: "https://example.invalid",
        session_token: "redacted-for-test",
        credential_source: "fixture",
      },
    },
    {
      mode: "sandbox",
      now,
      runContext: {
        runId: "sandbox-fixed-run",
        stageDirectory,
        artifactRoot,
      },
      taskUnderstanding: {
        result: {
          status: "resolved",
          taskId: "08",
          input: {
            customerName: "Nordhav AS",
            organizationNumber: "876520427",
            lineDescription: "Analyserapport",
            quantity: 1,
            unitPriceExcludingVatNok: 7850,
          },
        } satisfies TaskUnderstandingResolved<Record<string, unknown>, string>,
        taskSource: "manual-label",
        inputSource: "fixture",
        notes: ["Fixture-labeled replay for pipeline validation."],
      },
      fetch: createFixtureTripletexFetch(),
      requestId: "req-success-1",
    },
  );

  assert.equal(
    result.artifactPath,
    path.join(artifactRoot, "2026-03-20", "run-sandbox-fixed-run.json"),
  );
  assert.equal(result.stageDirectory, stageDirectory);
  assert.deepEqual(
    result.sidecarPaths.map((filePath) => path.basename(filePath)),
    ["run-sandbox-fixed-run.trace.json"],
  );

  const artifact = JSON.parse(
    await readFile(result.artifactPath, "utf8"),
  ) as {
    selection: { selectionConfigId: string };
    strategy: { strategyPath: string };
    execution: {
      runtimeStatus: string;
      apiCallCount: number;
      result?: {
        createdEntityIds?: Record<string, number>;
      };
    };
    input: { source: string; status: string };
    analysis?: { notes?: string[] };
    evaluation?: { status: string };
    sidecars?: Array<{ kind: string; path: string }>;
  };

  assert.equal(artifact.selection.selectionConfigId, "active-strategies-2026-03-20-task-stubs-a");
  assert.equal(
    artifact.strategy.strategyPath,
    "src/tasks/task-08/strategies/order-then-invoice-send.ts",
  );
  assert.equal(artifact.execution.runtimeStatus, "completed");
  assert.equal(artifact.execution.apiCallCount, 3);
  assert.deepEqual(artifact.execution.result?.createdEntityIds, {
    customerId: 42,
    invoiceId: 9001,
  });
  assert.equal(artifact.input.source, "fixture");
  assert.equal(artifact.input.status, "resolved");
  assert.equal(artifact.evaluation?.status, "not-available");
  assert.deepEqual(artifact.analysis?.notes, [
    "Fixture-labeled replay for pipeline validation.",
    "Deterministic runtime started only after the task-understanding handoff.",
  ]);
  assert.equal(artifact.sidecars?.length, 1);
  assert.equal(artifact.sidecars?.[0]?.kind, "sanitized-trace");
  assert.equal(artifact.sidecars?.[0]?.path, "run-sandbox-fixed-run.trace.json");

  await stat(path.join(stageDirectory, "request.json"));
  const stageResult = JSON.parse(
    await readFile(path.join(stageDirectory, "result.json"), "utf8"),
  ) as {
    artifactPath: string;
    requestId: string;
    runtimeStatus: string;
    sidecarPaths: string[];
  };
  assert.equal(stageResult.requestId, "req-success-1");
  assert.equal(stageResult.runtimeStatus, "completed");
  assert.equal(stageResult.artifactPath, result.artifactPath);
  assert.deepEqual(stageResult.sidecarPaths, [...result.sidecarPaths]);
  await stat(result.sidecarPaths[0]);
});

test("runCompetitionSolvePipeline can execute the explicit-send strategy when pinned", async (t) => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "tripletex2-solve-pipeline-explicit-send-"),
  );
  const artifactRoot = path.join(tempRoot, "runs");
  const stageDirectory = path.join(
    tempRoot,
    "data",
    "sandbox",
    "runs",
    "sandbox-explicit-send-run",
  );
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const result = await runCompetitionSolvePipeline(
    {
      prompt:
        "Opprett og send en faktura til kunden Nordhav AS (org.nr 876520427) på 7850 kr eksklusiv MVA. Fakturaen gjelder Analyserapport.",
      files: [],
      tripletex_credentials: {
        base_url: "https://example.invalid",
        session_token: "redacted-for-test",
        credential_source: "fixture",
      },
    },
    {
      mode: "sandbox",
      selectionConfigOverride: createSelectionConfigOverride({
        "08":
          "08.order-then-invoice-then-send.v1",
      }),
      runContext: {
        runId: "sandbox-explicit-send-run",
        stageDirectory,
        artifactRoot,
      },
      taskUnderstanding: {
        result: {
          status: "resolved",
          taskId: "08",
          input: {
            customerName: "Nordhav AS",
            organizationNumber: "876520427",
            lineDescription: "Analyserapport",
            quantity: 1,
            unitPriceExcludingVatNok: 7850,
          },
        } satisfies TaskUnderstandingResolved<Record<string, unknown>, string>,
        taskSource: "manual-label",
        inputSource: "fixture",
        notes: ["Fixture-labeled replay for explicit-send strategy validation."],
      },
      fetch: createFixtureTripletexFetch(),
      requestId: "req-explicit-send-1",
    },
  );

  const artifact = JSON.parse(
    await readFile(result.artifactPath, "utf8"),
  ) as {
    selection: { selectionConfigId: string };
    strategy: { strategyPath: string; strategyId: string };
    execution: {
      runtimeStatus: string;
      apiCallCount: number;
      result?: {
        verification?: Record<string, unknown>;
      };
    };
  };

  assert.equal(
    artifact.selection.selectionConfigId,
    "active-strategies-2026-03-20-explicit-invoice-send",
  );
  assert.equal(
    artifact.strategy.strategyId,
    "08.order-then-invoice-then-send.v1",
  );
  assert.equal(
    artifact.strategy.strategyPath,
    "src/tasks/task-08/strategies/order-then-invoice-then-send.ts",
  );
  assert.equal(artifact.execution.runtimeStatus, "completed");
  assert.equal(artifact.execution.apiCallCount, 4);
  assert.equal(
    artifact.execution.result?.verification?.sendTypeRequested,
    "EMAIL",
  );
  assert.equal(
    artifact.execution.result?.verification?.dispatchedViaExplicitInvoiceSend,
    true,
  );
});

test("runCompetitionSolvePipeline uses Codex/AGENTS task understanding by default", async (t) => {
  const outputRoot = await mkdtemp(
    path.join(os.tmpdir(), "tripletex2-solve-pipeline-codex-"),
  );
  t.after(async () => {
    await rm(outputRoot, { recursive: true, force: true });
  });

  const now = createFrozenNow("2026-03-20T22:00:00.000Z");
  const result = await runCompetitionSolvePipeline(
    {
      prompt:
        "Opprett og send en faktura til kunden Nordhav AS (org.nr 876520427) på 7850 kr eksklusiv MVA. Fakturaen gjelder Analyserapport.",
      files: [],
      tripletex_credentials: {
        base_url: "https://example.invalid",
        session_token: "redacted-for-test",
        credential_source: "fixture",
      },
    },
    {
      mode: "sandbox",
      now,
      runContext: {
        runId: "sandbox-codex-run",
        stageDirectory: path.join(outputRoot, "data", "sandbox", "runs", "sandbox-codex-run"),
        artifactRoot: outputRoot,
      },
      fetch: createFixtureTripletexFetch(),
      codexTaskUnderstanding: {
        executor: async ({ prompt }) => {
          assert.match(prompt, /Follow \.\/AGENTS\.md exactly\./);
          assert.match(prompt, /Registered task surfaces:/);

          return JSON.stringify({
            status: "resolved",
            taskId: "08",
            inputJson: JSON.stringify({
              customerName: "Nordhav AS",
              organizationNumber: "876520427",
              lineDescription: "Analyserapport",
              quantity: 1,
              unitPriceExcludingVatNok: 7850,
            }),
            code: null,
            message: null,
            partialInputJson: null,
            notes: [
              "Matched the prompt to the create-and-send-invoice task surface.",
            ],
          });
        },
      },
    },
  );

  const artifact = JSON.parse(
    await readFile(result.artifactPath, "utf8"),
  ) as {
    task: { taskSource: string };
    input: { source: string };
    analysis?: { notes?: string[] };
  };

  assert.equal(artifact.task.taskSource, "llm-classifier");
  assert.equal(artifact.input.source, "llm-extractor");
  assert.deepEqual(artifact.analysis?.notes, [
    "Task understanding ran via codex exec using ./AGENTS.md and a JSON-schema-constrained response.",
    "This path requires a locally installed, authenticated Codex CLI.",
    "Matched the prompt to the create-and-send-invoice task surface.",
    "Deterministic runtime started only after the task-understanding handoff.",
  ]);
});

test("runCompetitionSolvePipeline writes a canonical not-run artifact when task understanding stays unresolved", async (t) => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "tripletex2-solve-pipeline-unresolved-"),
  );
  const artifactRoot = path.join(tempRoot, "runs");
  const stageDirectory = path.join(
    tempRoot,
    "data",
    "sandbox",
    "runs",
    "sandbox-unresolved-run",
  );
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const result = await runCompetitionSolvePipeline(
    {
      prompt: "Create and send the invoice.",
      files: [],
      tripletex_credentials: {
        base_url: "https://example.invalid",
        session_token: "redacted-for-test",
      },
    },
    {
      mode: "sandbox",
      runContext: {
        runId: "sandbox-unresolved-run",
        stageDirectory,
        artifactRoot,
      },
      classifierExtractor: async () => ({
        status: "unresolved",
        code: "no-task-match",
        message: "No registered task matched the request.",
      }),
      requestId: "req-unresolved-1",
    },
  );

  const artifact = JSON.parse(
    await readFile(result.artifactPath, "utf8"),
  ) as {
    task: { taskId: string };
    strategy: { strategyId: string };
    input: {
      status: string;
      issues?: Array<{ code: string; message: string }>;
    };
    execution: {
      runtimeStatus: string;
      apiCallCount: number;
    };
    analysis?: { notes?: string[]; failureMode?: string };
  };

  assert.equal(artifact.task.taskId, "unresolved-task-understanding");
  assert.equal(
    artifact.strategy.strategyId,
    "system.not-run.unresolved-task-understanding.v1",
  );
  assert.equal(artifact.input.status, "failed");
  assert.deepEqual(artifact.input.issues, [
    {
      code: "no-task-match",
      message: "No registered task matched the request.",
    },
  ]);
  assert.equal(artifact.execution.runtimeStatus, "not-run");
  assert.equal(artifact.execution.apiCallCount, 0);
  assert.equal(artifact.analysis?.failureMode, "no-task-match");
  assert.deepEqual(artifact.analysis?.notes, [
    "Task understanding used an injected extractor instead of the default Codex/AGENTS path.",
    "Deterministic runtime did not start because task understanding or strategy selection was unresolved.",
  ]);

  const stageResult = JSON.parse(
    await readFile(path.join(stageDirectory, "result.json"), "utf8"),
  ) as {
    requestId: string;
    runtimeStatus: string;
  };
  assert.equal(stageResult.requestId, "req-unresolved-1");
  assert.equal(stageResult.runtimeStatus, "not-run");
});

function createFrozenNow(timestamp: string): () => Date {
  return () => new Date(timestamp);
}

function createSelectionConfigOverride(
  overrides: Record<string, string>,
): {
  schemaVersion: "tripletex2.active-strategy-selection.v1";
  selectionConfigId: string;
  taskStrategies: Record<string, string>;
} {
  return {
    schemaVersion: "tripletex2.active-strategy-selection.v1",
    selectionConfigId: "active-strategies-2026-03-20-explicit-invoice-send",
    taskStrategies: {
      "07":
        "07.not-implemented.v1",
      "08":
        "08.order-then-invoice-send.v1",
      "01": "01.not-implemented.v1",
      "09": "09.not-implemented.v1",
      "03": "03.not-implemented.v1",
      "06": "06.not-implemented.v1",
      "11":
        "11.not-implemented.v1",
      "04": "04.not-implemented.v1",
      "05": "05.not-implemented.v1",
      "02": "02.not-implemented.v1",
      "10": "10.not-implemented.v1",
      "17":
        "17.not-implemented.v1",
      "15":
        "15.not-implemented.v1",
      "16":
        "16.not-implemented.v1",
      "13":
        "13.not-implemented.v1",
      "18":
        "18.not-implemented.v1",
      "12": "12.not-implemented.v1",
      "14":
        "14.not-implemented.v1",
      ...overrides,
    },
  };
}

function createFixtureTripletexFetch(): TripletexFetch {
  return async (input, init) => {
    const url = new URL(input);
    if (init.method === "GET" && url.pathname === "/customer") {
      return createResponse(200, {
        values: [
          {
            id: 42,
            name: "Nordhav AS",
            organizationNumber: "876520427",
            invoiceSendMethod: "EMAIL",
          },
        ],
      });
    }

    if (init.method === "GET" && url.pathname === "/ledger/vatType") {
      return createResponse(200, {
        values: [
          {
            id: 3,
            percentage: 25,
          },
        ],
      });
    }

    if (init.method === "POST" && url.pathname === "/invoice") {
      return createResponse(200, {
        value: {
          id: 9001,
          invoiceNumber: 110045,
        },
      });
    }

    if (init.method === "PUT" && url.pathname === "/invoice/9001/:send") {
      return createResponse(200, {});
    }

    throw new Error(`Unexpected Tripletex fixture request: ${init.method} ${url.pathname}`);
  };
}

function createResponse(
  status: number,
  body: unknown,
): TripletexFetchResponse {
  return {
    status,
    headers: {
      get() {
        return null;
      },
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}
