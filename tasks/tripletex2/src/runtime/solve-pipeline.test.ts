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
import { taskRegistrations } from "../registry/tasks";
import {
  resolveDeterministicSolveSelection,
  runCompetitionSolvePipeline,
} from "./solve-pipeline";

test("runCompetitionSolvePipeline executes the pinned strategy and writes canonical plus staging lineage", async (t) => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "tripletex2-solve-pipeline-"),
  );
  const artifactRoot = path.join(tempRoot, "runs");
  const promptCorpusPath = path.join(tempRoot, "data", "prompt-corpus.jsonl");
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
      promptCorpusPath,
      selectionConfigOverride: await createSelectionConfigOverride({}),
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

  assert.equal(
    artifact.selection.selectionConfigId,
    "active-strategies-test-selection",
  );
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
  const promptCorpusEntry = JSON.parse(
    await readFile(promptCorpusPath, "utf8"),
  ) as {
    files: string[];
    prompt: string;
    runId: string;
    source: string;
    status: string;
    taskId: string;
    timestamp: string;
    txTaskId: string;
  };
  assert.deepEqual(promptCorpusEntry, {
    taskId: "08",
    txTaskId: "08",
    status: "resolved",
    prompt:
      "Opprett og send en faktura til kunden Nordhav AS (org.nr 876520427) på 7850 kr eksklusiv MVA. Fakturaen gjelder Analyserapport.",
    files: [],
    runId: "sandbox-fixed-run",
    timestamp: "2026-03-20T21:10:15.000Z",
    source: "sandbox",
  });
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
  const promptCorpusPath = path.join(tempRoot, "data", "prompt-corpus.jsonl");
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
      promptCorpusPath,
      selectionConfigOverride: await createSelectionConfigOverride({
        "08":
          "08.order-then-invoice-then-send.v1",
      }, "active-strategies-2026-03-20-explicit-invoice-send"),
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

test("runCompetitionSolvePipeline can execute the supplier-invoice import strategy when pinned", async (t) => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "tripletex2-solve-pipeline-supplier-invoice-"),
  );
  const artifactRoot = path.join(tempRoot, "runs");
  const promptCorpusPath = path.join(tempRoot, "data", "prompt-corpus.jsonl");
  const stageDirectory = path.join(
    tempRoot,
    "data",
    "sandbox",
    "runs",
    "sandbox-supplier-invoice-run",
  );
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });
  const now = createFrozenNow("2026-03-20T22:05:00.000Z");

  const result = await runCompetitionSolvePipeline(
    {
      prompt:
        "Registrer leverandorfaktura fra Elvdal AS (org.nr 889157917), fakturanummer INV-2026-8662, kontortenester, 39750 kr inkludert mva pa konto 6500 med 25 prosent mva.",
      files: [],
      tripletex_credentials: {
        base_url: "https://example.invalid",
        session_token: "redacted-for-test",
        credential_source: "fixture",
      },
    },
    {
      mode: "sandbox",
      promptCorpusPath,
      now,
      selectionConfigOverride: await createSelectionConfigOverride({
        "16": "16.import-then-book-voucher.v1",
      }, "active-strategies-2026-03-20-supplier-invoice-import"),
      now: createFrozenNow("2026-03-20T21:10:15.000Z"),
      runContext: {
        runId: "sandbox-supplier-invoice-run",
        stageDirectory,
        artifactRoot,
      },
      taskUnderstanding: {
        result: {
          status: "resolved",
          taskId: "16",
          input: {
            supplierName: "Elvdal AS",
            organizationNumber: "889157917",
            invoiceNumber: "INV-2026-8662",
            lineDescription: "kontortenester",
            grossAmountNok: 39750,
            expenseAccountNumber: 6500,
            vatRatePercent: 25,
          },
        } satisfies TaskUnderstandingResolved<Record<string, unknown>, string>,
        taskSource: "manual-label",
        inputSource: "fixture",
        notes: ["Fixture-labeled replay for supplier-invoice strategy validation."],
      },
      fetch: createSupplierInvoiceFixtureTripletexFetch(),
      requestId: "req-supplier-invoice-1",
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
        createdEntityIds?: Record<string, number>;
        verification?: Record<string, unknown>;
      };
    };
  };

  assert.equal(
    artifact.selection.selectionConfigId,
    "active-strategies-2026-03-20-supplier-invoice-import",
  );
  assert.equal(
    artifact.strategy.strategyId,
    "16.import-then-book-voucher.v1",
  );
  assert.equal(
    artifact.strategy.strategyPath,
    "src/tasks/task-16/strategies/import-then-book-voucher.ts",
  );
  assert.equal(artifact.execution.runtimeStatus, "completed");
  assert.equal(artifact.execution.apiCallCount, 5);
  assert.deepEqual(artifact.execution.result?.createdEntityIds, {
    supplierId: 108244534,
    voucherId: 608856087,
  });
  assert.equal(artifact.execution.result?.verification?.netAmount, 31800);
  assert.equal(
    artifact.execution.result?.verification?.sendToLedgerRequested,
    false,
  );
});

test("runCompetitionSolvePipeline uses Codex codex-environment task understanding by default", async (t) => {
  const outputRoot = await mkdtemp(
    path.join(os.tmpdir(), "tripletex2-solve-pipeline-codex-"),
  );
  const promptCorpusPath = path.join(outputRoot, "data", "prompt-corpus.jsonl");
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
      promptCorpusPath,
      selectionConfigOverride: await createSelectionConfigOverride({}),
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
    "Task understanding ran via codex in tmux using ./AGENTS.md and an internal callback handoff.",
    "This path requires a locally installed, authenticated Codex CLI, tmux, and the local Tripletex2 server.",
    "Matched the prompt to the create-and-send-invoice task surface.",
    "Deterministic runtime started only after the task-understanding handoff.",
  ]);
});

test("runCompetitionSolvePipeline writes a canonical not-run artifact when task understanding stays unresolved", async (t) => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "tripletex2-solve-pipeline-unresolved-"),
  );
  const artifactRoot = path.join(tempRoot, "runs");
  const promptCorpusPath = path.join(tempRoot, "data", "prompt-corpus.jsonl");
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
      promptCorpusPath,
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
    "Task understanding used an injected extractor instead of the default Codex codex-environment path.",
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
  await assert.rejects(stat(promptCorpusPath));
});

test("resolveDeterministicSolveSelection keeps retrying after a rejected task and an invalid unresolved retry response", async () => {
  const seenRetryContexts: Array<{
    attemptNumber?: number;
    excludedTaskIds?: readonly string[];
    remainingTaskIds?: readonly string[];
    unresolvedIsInvalid?: boolean;
  }> = [];
  let callCount = 0;

  const selection = await resolveDeterministicSolveSelection(
    {
      prompt: "Lag kundeposten.",
      files: [],
      tripletexCredentials: {
        baseUrl: "https://example.invalid",
        sessionToken: "redacted-for-test",
      },
    },
    {
      nonEligibleTaskPolicyOverride: {
        schemaVersion: "tripletex2.non-eligible-task-policy.v1",
        policyId: "policy-retry-test",
        excludedCanonicalTasks: {
          "08": {
            reasonCode: "already-perfect",
            reason: "Canonical task 08 is already perfect and non-eligible for live selection.",
          },
        },
      },
      classifierExtractor: async (input) => {
        callCount += 1;
        seenRetryContexts.push({
          attemptNumber: input.retryContext?.attemptNumber,
          excludedTaskIds: input.retryContext?.excludedTaskIds,
          remainingTaskIds: input.retryContext?.remainingTaskIds,
          unresolvedIsInvalid: input.retryContext?.unresolvedIsInvalid,
        });

        if (callCount === 1) {
          return {
            status: "resolved",
            taskId: "08",
            input: {
              customerName: "Nordhav AS",
              organizationNumber: "876520427",
              lineDescription: "Analyserapport",
              quantity: 1,
              unitPriceExcludingVatNok: 7850,
            },
          };
        }

        if (callCount === 2) {
          return {
            status: "unresolved",
            code: "ambiguous-task",
            message: "Second-best interpretation is weak.",
          };
        }

        return {
          status: "resolved",
          taskId: "01",
          input: {
            customerName: "Nordhav AS",
            organizationNumber: "876520427",
            email: "post@nordhav.example",
          },
        };
      },
    },
  );

  assert.equal(selection.taskId, "01");
  assert.equal(selection.taskUnderstanding.result.status, "resolved");
  assert.equal(
    selection.taskUnderstanding.result.status === "resolved"
      ? selection.taskUnderstanding.result.taskId
      : undefined,
    "01",
  );
  assert.equal(callCount, 3);
  assert.deepEqual(seenRetryContexts, [
    {
      attemptNumber: undefined,
      excludedTaskIds: undefined,
      remainingTaskIds: undefined,
      unresolvedIsInvalid: undefined,
    },
    {
      attemptNumber: 2,
      excludedTaskIds: ["08"],
      remainingTaskIds: selection.taskUnderstanding.attempts[1]
        ? seenRetryContexts[1]?.remainingTaskIds
        : undefined,
      unresolvedIsInvalid: true,
    },
    {
      attemptNumber: 3,
      excludedTaskIds: ["08"],
      remainingTaskIds: selection.taskUnderstanding.attempts[2]
        ? seenRetryContexts[2]?.remainingTaskIds
        : undefined,
      unresolvedIsInvalid: true,
    },
  ]);
  assert.equal(seenRetryContexts[1]?.remainingTaskIds?.includes("08"), false);
  assert.equal(seenRetryContexts[2]?.remainingTaskIds?.includes("08"), false);
});

test("resolveDeterministicSolveSelection exhausts the canonical task universe before returning unresolved", async () => {
  const excludedCanonicalTasks = Object.fromEntries(
    taskRegistrations.map((registration) => [
      registration.task.taskId,
      {
        reasonCode: "non-eligible" as const,
        reason: `Canonical task ${registration.task.taskId} is non-eligible in this test policy.`,
      },
    ]),
  );
  let callIndex = 0;

  const selection = await resolveDeterministicSolveSelection(
    {
      prompt: "Test exhaust the universe.",
      files: [],
      tripletexCredentials: {
        baseUrl: "https://example.invalid",
        sessionToken: "redacted-for-test",
      },
    },
    {
      nonEligibleTaskPolicyOverride: {
        schemaVersion: "tripletex2.non-eligible-task-policy.v1",
        policyId: "policy-exhaustive-test",
        excludedCanonicalTasks,
      },
      classifierExtractor: async () => {
        const taskId = taskRegistrations[callIndex]!.task.taskId;
        callIndex += 1;
        return {
          status: "resolved",
          taskId,
          input: {},
        };
      },
    },
  );

  assert.equal(selection.taskUnderstanding.result.status, "unresolved");
  assert.equal(
    selection.taskUnderstanding.result.status === "unresolved"
      ? selection.taskUnderstanding.result.code
      : undefined,
    "no-task-match",
  );
  assert.equal(callIndex, taskRegistrations.length);
});

test("runCompetitionSolvePipeline writes the retry chain into trace and reflection sidecars", async (t) => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "tripletex2-solve-pipeline-retry-chain-"),
  );
  const artifactRoot = path.join(tempRoot, "runs");
  const promptCorpusPath = path.join(tempRoot, "data", "prompt-corpus.jsonl");
  const stageDirectory = path.join(
    tempRoot,
    "data",
    "sandbox",
    "runs",
    "sandbox-retry-chain-run",
  );
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  let callCount = 0;
  const result = await runCompetitionSolvePipeline(
    {
      prompt: "Opprett kunden Nordhav AS.",
      files: [],
      tripletex_credentials: {
        base_url: "https://example.invalid",
        session_token: "redacted-for-test",
      },
    },
    {
      mode: "sandbox",
      promptCorpusPath,
      runContext: {
        runId: "sandbox-retry-chain-run",
        stageDirectory,
        artifactRoot,
      },
      nonEligibleTaskPolicyOverride: {
        schemaVersion: "tripletex2.non-eligible-task-policy.v1",
        policyId: "policy-trace-test",
        excludedCanonicalTasks: {
          "08": {
            reasonCode: "already-perfect",
            reason: "Canonical task 08 is already perfect and non-eligible for live selection.",
          },
        },
      },
      classifierExtractor: async () => {
        callCount += 1;
        if (callCount === 1) {
          return {
            status: "resolved",
            taskId: "08",
            input: {
              customerName: "Nordhav AS",
              organizationNumber: "876520427",
              lineDescription: "Analyserapport",
              quantity: 1,
              unitPriceExcludingVatNok: 7850,
            },
          };
        }

        return {
          status: "resolved",
          taskId: "01",
          input: {
            customerName: "Nordhav AS",
            organizationNumber: "876520427",
            email: "post@nordhav.example",
          },
        };
      },
      fetch: createCreateCustomerFixtureTripletexFetch(),
    },
  );

  const artifact = JSON.parse(await readFile(result.artifactPath, "utf8")) as {
    task: { taskId: string };
    sidecars?: Array<{ kind: string; path: string }>;
  };
  assert.equal(artifact.task.taskId, "01");
  assert.equal(callCount, 2);
  assert.deepEqual(
    artifact.sidecars?.map((sidecar) => sidecar.kind),
    ["sanitized-trace", "reflection-summary"],
  );

  const traceSidecar = JSON.parse(await readFile(result.sidecarPaths[0], "utf8")) as {
    payload: { notes?: string[] };
  };
  assert.equal(
    traceSidecar.payload.notes?.some((note) =>
      note.includes('rejected canonical task id "08" as already-perfect'),
    ),
    true,
  );
  assert.equal(
    traceSidecar.payload.notes?.includes('Final accepted canonical task id: "01".'),
    true,
  );

  const reflectionSidecar = JSON.parse(
    await readFile(result.sidecarPaths[1], "utf8"),
  ) as {
    payload: { summary?: string; findings?: string[] };
  };
  assert.match(
    reflectionSidecar.payload.summary ?? "",
    /accepted canonical task id "01" after excluding earlier non-eligible selections/,
  );
  assert.equal(
    reflectionSidecar.payload.findings?.some((finding) =>
      finding.includes('accepted canonical task id "01"'),
    ),
    true,
  );
});

function createFrozenNow(timestamp: string): () => Date {
  return () => new Date(timestamp);
}

async function createSelectionConfigOverride(
  overrides: Record<string, string>,
  selectionConfigId = "active-strategies-test-selection",
): Promise<{
  schemaVersion: "tripletex2.active-strategy-selection.v1";
  selectionConfigId: string;
  taskStrategies: Record<string, string>;
}> {
  const taskStrategies = Object.fromEntries(
    await Promise.all(
      taskRegistrations.map(async (registration) => {
        const taskModule = await registration.loadTaskModule();
        return [
          registration.task.taskId,
          taskModule.strategies[0]?.strategyId ??
            `${registration.task.taskId}.missing-strategy`,
        ];
      }),
    ),
  );

  return {
    schemaVersion: "tripletex2.active-strategy-selection.v1",
    selectionConfigId,
    taskStrategies: {
      ...taskStrategies,
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

function createSupplierInvoiceFixtureTripletexFetch(): TripletexFetch {
  return async (input, init) => {
    const url = new URL(input);
    if (init.method === "POST" && url.pathname === "/supplier") {
      return createResponse(201, {
        value: {
          id: 108244534,
          name: "Elvdal AS",
          organizationNumber: "889157917",
          ledgerAccount: {
            id: 424190921,
          },
        },
      });
    }

    if (init.method === "GET" && url.pathname === "/ledger/account") {
      return createResponse(200, {
        values: [
          {
            id: 424191158,
            number: 6500,
            isApplicableForSupplierInvoice: true,
          },
        ],
      });
    }

    if (init.method === "GET" && url.pathname === "/ledger/vatType") {
      return createResponse(200, {
        values: [
          {
            id: 1,
            number: "1",
            percentage: 25,
          },
        ],
      });
    }

    if (
      init.method === "POST" &&
      url.pathname === "/ledger/voucher/importDocument"
    ) {
      assert.ok(init.body instanceof FormData);
      return createResponse(201, {
        values: [
          {
            id: 608856087,
            version: 4,
          },
        ],
      });
    }

    if (init.method === "PUT" && url.pathname === "/ledger/voucher/608856087") {
      return createResponse(200, {
        value: {
          id: 608856087,
          postings: [
            {
              row: 1,
              amount: 31800,
              amountGross: 39750,
              account: { id: 424191158 },
              vatType: { id: 1 },
            },
            {
              row: 2,
              amount: -39750,
              amountGross: -39750,
              invoiceNumber: "INV-2026-8662",
              termOfPayment: "2026-03-20",
              account: { id: 424190921 },
              supplier: { id: 108244534 },
            },
            {
              row: 3,
              amount: 7950,
              amountGross: 7950,
              account: { id: 424190999 },
            },
          ],
        },
      });
    }

    throw new Error(`Unexpected Tripletex fixture request: ${init.method} ${url.pathname}`);
  };
}

function createCreateCustomerFixtureTripletexFetch(): TripletexFetch {
  return async (input, init) => {
    const url = new URL(input);

    if (init.method === "POST" && url.pathname === "/customer") {
      return createResponse(200, {
        value: {
          id: 101,
          name: "Nordhav AS",
          organizationNumber: "876520427",
          email: "post@nordhav.example",
        },
      });
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
