import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { RUN_ARTIFACT_SCHEMA_VERSION, type TripletexClient } from "../runtime/contracts";
import { runBestEffortSandboxCleanup } from "./cleanup";

test("best-effort cleanup discovers nested and batch-created sandbox refs from artifacts", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "tripletex2-sandbox-cleanup-"));
  const artifactPath = path.join(tempRoot, "run-artifact.json");
  await writeFile(
    artifactPath,
    JSON.stringify(
      {
        schemaVersion: RUN_ARTIFACT_SCHEMA_VERSION,
        runId: "sandbox-task29-run",
        createdAt: "2026-03-21T22:00:00.000Z",
        mode: "sandbox",
        task: {
          taskId: "29",
          taskSource: "manual-label",
        },
        strategy: {
          strategyId: "29.full-project-lifecycle.v1",
          strategyPath: "src/tasks/task-29/strategies/full-project-lifecycle.ts",
          strategyStatus: "draft",
        },
        selection: {
          selectionConfigId: "test",
          selectionConfigPath: "test",
        },
        request: {
          requestFingerprint: "fp",
          files: [],
        },
        input: {
          inputSchemaId: "test",
          status: "resolved",
          source: "manual",
          value: {},
        },
        execution: {
          runtimeStatus: "completed",
          apiCallCount: 3,
          api4xxCount: 0,
          api5xxCount: 0,
          apiCalls: [
            {
              index: 1,
              method: "POST",
              path: "/customer",
              status: 201,
              entityIds: { customerId: 1001 },
            },
            {
              index: 2,
              method: "POST",
              path: "/project",
              status: 201,
              entityIds: { projectId: 2002 },
            },
            {
              index: 3,
              method: "PUT",
              path: "/order/3010/:invoice",
              status: 200,
              entityIds: { invoiceId: 4004 },
            },
          ],
          result: {
            createdEntityIds: {
              employee1Id: 501,
            },
            verification: {
              employeeSummaries: [
                { employeeId: 501, created: true },
                { employeeId: 777, created: false },
              ],
              timesheetEntryIds: [601, 602],
            },
          },
        },
      },
      null,
      2,
    ),
  );

  const result = await runBestEffortSandboxCleanup({
    credentials: {
      base_url: "https://sandbox.example.invalid/v2",
      session_token: "secret",
    },
    dryRun: true,
    files: [artifactPath],
  });

  assert.deepEqual(
    result.report.discoveredRefs.map((ref) => [ref.entityType, ref.entityId]),
    [
      ["customer", 1001],
      ["employee", 501],
      ["invoice", 4004],
      ["project", 2002],
      ["timesheetEntry", 601],
      ["timesheetEntry", 602],
    ],
  );
});

test("best-effort cleanup deletes customers and neutralizes employees", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "tripletex2-sandbox-cleanup-run-"));
  const artifactPath = path.join(tempRoot, "run-artifact.json");
  await writeFile(
    artifactPath,
    JSON.stringify(
      {
        schemaVersion: RUN_ARTIFACT_SCHEMA_VERSION,
        runId: "sandbox-task06-run",
        createdAt: "2026-03-21T22:05:00.000Z",
        mode: "sandbox",
        task: {
          taskId: "06",
          taskSource: "manual-label",
        },
        strategy: {
          strategyId: "06.create-employee.v1",
          strategyPath: "src/tasks/task-06/strategies/create-employee.ts",
          strategyStatus: "draft",
        },
        selection: {
          selectionConfigId: "test",
          selectionConfigPath: "test",
        },
        request: {
          requestFingerprint: "fp",
          files: [],
        },
        input: {
          inputSchemaId: "test",
          status: "resolved",
          source: "manual",
          value: {},
        },
        execution: {
          runtimeStatus: "completed",
          apiCallCount: 2,
          api4xxCount: 0,
          api5xxCount: 0,
          apiCalls: [
            {
              index: 1,
              method: "POST",
              path: "/customer",
              status: 201,
              entityIds: { customerId: 1001 },
            },
            {
              index: 2,
              method: "POST",
              path: "/employee",
              status: 201,
              entityIds: { employeeId: 2002 },
            },
          ],
          result: {
            createdEntityIds: {
              employeeId: 2002,
              employmentId: 3003,
            },
          },
        },
      },
      null,
      2,
    ),
  );

  const seenDeletes: string[] = [];
  const seenPuts: Array<{ path: string; body: unknown }> = [];
  const employment = {
    id: 3003,
    employee: { id: 2002 },
    endDate: undefined as string | undefined,
  };
  const client: TripletexClient = {
    async get(requestPath) {
      if (requestPath === "/employee/2002") {
        return {
          value: {
            id: 2002,
            email: "person@example.org",
            employments: [{ id: 3003 }],
          },
        };
      }
      if (requestPath === "/employee/employment/3003") {
        return {
          value: employment,
        };
      }
      throw new Error(`Unexpected GET ${requestPath}`);
    },
    async post() {
      throw new Error("Unexpected POST");
    },
    async put(requestPath, options) {
      seenPuts.push({ path: requestPath, body: options?.body });
      if (requestPath === "/employee/employment/3003") {
        employment.endDate = (options?.body as { endDate?: string } | undefined)?.endDate;
      }
      return { value: { id: 1 } };
    },
    async delete(requestPath) {
      seenDeletes.push(requestPath);
      return undefined as any;
    },
  };

  const result = await runBestEffortSandboxCleanup({
    credentials: {
      base_url: "https://sandbox.example.invalid/v2",
      session_token: "secret",
    },
    files: [artifactPath],
    client,
  });

  assert.equal(result.report.summary.failed, 0);
  assert.deepEqual(seenDeletes, ["/customer/1001"]);
  assert.deepEqual(
    seenPuts.map((entry) => entry.path),
    ["/employee/employment/3003", "/employee/2002"],
  );
});
