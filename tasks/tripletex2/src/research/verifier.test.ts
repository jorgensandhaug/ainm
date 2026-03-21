import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createEmptyCandidateStore,
  loadCandidateStore,
  writeCandidateStore,
} from "./candidate-store";
import {
  evaluateVerificationPlan,
  updateCandidateStoreFromVerification,
} from "./verifier";
import type {
  ResearchTaskPacket,
  ResearchVerificationPlan,
  ResearchVerificationReport,
} from "./types";

test("evaluateVerificationPlan resolves object and collection checks against verification context", async () => {
  const plan: ResearchVerificationPlan = {
    schemaVersion: "tripletex2.research-verification-plan.v1",
    planId: "task-06.test",
    taskId: "06",
    checks: [
      {
        type: "object",
        checkId: "employee",
        description: "Employee readback",
        pathTemplate: "/employee/{{result.createdEntityIds.employeeId}}",
        query: { fields: "*" },
        responsePath: "value",
        assertions: [
          {
            actualPath: "email",
            equalsFromPath: "result.verification.email",
          },
        ],
      },
      {
        type: "collection",
        checkId: "employment",
        description: "Employment readback",
        pathTemplate: "/employee/employment",
        query: {
          employeeId: "{{result.createdEntityIds.employeeId}}",
          fields: "*",
        },
        collectionPath: "values",
        matchPath: "id",
        matchFromPath: "result.createdEntityIds.employmentId",
        assertions: [
          {
            actualPath: "startDate",
            equalsFromPath: "result.verification.startDate",
          },
        ],
      },
    ],
  };

  const inspection = await evaluateVerificationPlan({
    plan,
    artifact: {
      execution: {
        result: {
          createdEntityIds: {
            employeeId: 601,
            employmentId: 901,
          },
          verification: {
            email: "thomas.harris@example.org",
            startDate: "2026-10-06",
          },
        },
      },
    } as any,
    tripletex: {
      async get(path) {
        if (path === "/employee/601") {
          return {
            value: {
              email: "thomas.harris@example.org",
            },
          } as any;
        }
        if (path === "/employee/employment") {
          return {
            values: [
              { id: 901, startDate: "2026-10-06" },
              { id: 902, startDate: "2026-10-07" },
            ],
          } as any;
        }
        throw new Error(`Unexpected verification GET ${path}`);
      },
    },
  });

  assert.equal(inspection.status, "passed");
  assert.equal(inspection.checks.length, 2);
  assert.ok(inspection.checks.every((check) => check.status === "passed"));
});

test("updateCandidateStoreFromVerification records reset-stage failures for active strategies", async () => {
  const tempDirectory = await mkdtemp(
    path.join(os.tmpdir(), "tripletex2-verifier-test-"),
  );
  const candidateStorePath = path.join(tempDirectory, "candidate-strategies.json");

  try {
    await writeCandidateStore(
      createEmptyCandidateStore(new Date("2026-03-21T20:24:00.000Z")),
      candidateStorePath,
    );

    const packet: ResearchTaskPacket = {
      schemaVersion: "tripletex2.research-packet.v1",
      packetId: "task-06-packet-test",
      createdAt: "2026-03-21T20:24:11.930Z",
      taskId: "06",
      txTaskId: "06",
      taskSlug: "create-employee",
      taskName: "Create employee",
      queueEntry: {
        taskId: "06",
        txTaskId: "06",
        taskSlug: "create-employee",
        taskName: "Create employee",
        priority: 1,
        band: "focus",
        queueEligibility: "ready",
        notes: [],
      },
      activeStrategy: {
        strategyId: "06.create-employee.v1",
        strategyPath: "src/tasks/task-06/strategies/create-employee.ts",
        strategyStatus: "draft",
        strategyName: "Create employee",
      },
      availableStrategies: [],
      candidateSummary: {
        totalCandidates: 0,
        statuses: {
          draft: 0,
          "sandbox-pass": 0,
          "sandbox-fail": 0,
          "needs-review": 0,
          "promote-later": 0,
        },
      },
      tripletex2Evidence: {
        runCount: 0,
        recentArtifacts: [],
      },
      legacyEvidence: {
        leaderboardSnapshots: [],
        promptLabelSampleCount: 0,
        recentAttributedRunIds: [],
        evidenceWarnings: [],
      },
      taskContext: {
        knownFailureModes: [],
      },
      operatorNotes: [],
    };
    const report: ResearchVerificationReport = {
      schemaVersion: "tripletex2.research-verification-report.v1",
      reportId: "verify-06-test",
      createdAt: "2026-03-21T20:24:23.550Z",
      taskId: "06",
      strategyId: "06.create-employee.v1",
      candidateId: "06.create-employee.v1",
      packetPath: "/tmp/task-06-packet.json",
      stageDirectory: "/tmp/stage",
      artifactPath: "",
      sandboxReset: {
        command: "bun reset-sandbox.ts apply",
        exitCode: 1,
        stdout: "",
        stderr: "reset blocker: sandbox drift is too large",
        highlights: ["reset blocker: sandbox drift is too large"],
      },
      failureStage: "reset",
      challengeRun: {
        runtimeStatus: "not-run",
        apiCallCount: 0,
        baselineCallBudget: 2,
        withinBudget: false,
      },
      inspection: {
        status: "failed",
        apiCallCount: 0,
        checks: [],
      },
      verdict: {
        status: "needs-review",
        correctnessPassed: false,
        withinBudget: false,
        message: "Sandbox reset failed before challenger verification started.",
      },
    };

    await updateCandidateStoreFromVerification({
      candidateStorePath,
      packet,
      packetPath: report.packetPath,
      reportPath: "/tmp/verify-06-test.json",
      report,
    });

    const store = await loadCandidateStore(candidateStorePath);
    assert.equal(store.entries.length, 1);
    assert.deepEqual(store.entries[0], {
      candidateId: "06.create-employee.v1",
      taskId: "06",
      strategyId: "06.create-employee.v1",
      strategyPath: "src/tasks/task-06/strategies/create-employee.ts",
      strategyName: "Create employee",
      status: "needs-review",
      packetPath: "/tmp/task-06-packet.json",
      latestVerificationReportPath: "/tmp/verify-06-test.json",
      latestSandboxVerdict: {
        correctnessPassed: false,
        withinBudget: false,
        apiCallCount: 0,
        baselineCallBudget: 2,
        verificationReportPath: "/tmp/verify-06-test.json",
      },
      notes: ["Sandbox reset failed before challenger verification started."],
      createdAt: "2026-03-21T20:24:23.550Z",
      updatedAt: "2026-03-21T20:24:23.550Z",
    });
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
