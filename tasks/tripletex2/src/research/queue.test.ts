import assert from "node:assert/strict";
import test from "node:test";

import {
  getTopReadyQueueEntries,
  parseResearchTaskQueue,
} from "./queue";

test("research queue parsing sorts entries by priority and filters ready tasks", () => {
  const queue = parseResearchTaskQueue({
    schemaVersion: "tripletex2.research-queue.v1",
    updatedAt: "2026-03-21T20:00:00.000Z",
    entries: [
      {
        taskId: "24",
        txTaskId: "24",
        taskSlug: "correct-ledger-errors",
        taskName: "Correct ledger errors",
        priority: 2,
        band: "focus",
        queueEligibility: "ready",
        notes: ["High-upside bug fix target."],
      },
      {
        taskId: "06",
        txTaskId: "06",
        taskSlug: "create-employee",
        taskName: "Create employee",
        priority: 1,
        band: "focus",
        queueEligibility: "ready",
        notes: ["Only remaining Tier 1 gap."],
      },
      {
        taskId: "03",
        txTaskId: "03",
        taskSlug: "create-department",
        taskName: "Create department",
        priority: 10,
        band: "kill",
        queueEligibility: "do-not-work",
        notes: ["Score maxed."],
      },
    ],
  });

  assert.deepEqual(
    queue.entries.map((entry) => entry.taskId),
    ["06", "24", "03"],
  );
  assert.deepEqual(
    getTopReadyQueueEntries(queue, 2).map((entry) => entry.taskId),
    ["06", "24"],
  );
});

test("research queue parsing rejects duplicate task ids", () => {
  assert.throws(
    () =>
      parseResearchTaskQueue({
        schemaVersion: "tripletex2.research-queue.v1",
        updatedAt: "2026-03-21T20:00:00.000Z",
        entries: [
          {
            taskId: "06",
            txTaskId: "06",
            taskSlug: "create-employee",
            taskName: "Create employee",
            priority: 1,
            band: "focus",
            queueEligibility: "ready",
            notes: ["Only remaining Tier 1 gap."],
          },
          {
            taskId: "06",
            txTaskId: "06",
            taskSlug: "create-employee",
            taskName: "Create employee duplicate",
            priority: 2,
            band: "watch",
            queueEligibility: "hold",
            notes: ["Invalid duplicate."],
          },
        ],
      }),
    /duplicate taskId "06"/,
  );
});
