import assert from "node:assert/strict";
import test from "node:test";

import {
  createEmptyCandidateStore,
  parseCandidateStore,
  summarizeCandidateStatuses,
  upsertCandidateRecord,
} from "./candidate-store";

test("candidate store upsert replaces an existing candidate and updates status summary", () => {
  const baseStore = createEmptyCandidateStore(
    new Date("2026-03-21T20:00:00.000Z"),
  );
  const storeWithDraft = upsertCandidateRecord(baseStore, {
    candidateId: "06.create-employee.v1",
    taskId: "06",
    strategyId: "06.create-employee.v1",
    status: "draft",
    notes: ["Initial candidate."],
    createdAt: "2026-03-21T20:00:00.000Z",
    updatedAt: "2026-03-21T20:00:00.000Z",
  });
  const storeWithPass = upsertCandidateRecord(storeWithDraft, {
    candidateId: "06.create-employee.v1",
    taskId: "06",
    strategyId: "06.create-employee.v1",
    status: "sandbox-pass",
    notes: ["Verified in sandbox."],
    createdAt: "2026-03-21T20:00:00.000Z",
    updatedAt: "2026-03-21T20:05:00.000Z",
  });

  assert.equal(storeWithPass.entries.length, 1);
  assert.equal(storeWithPass.entries[0].status, "sandbox-pass");
  assert.deepEqual(summarizeCandidateStatuses(storeWithPass, "06"), {
    draft: 0,
    "sandbox-pass": 1,
    "sandbox-fail": 0,
    "needs-review": 0,
    "promote-later": 0,
  });
});

test("candidate store parsing rejects duplicate candidate ids", () => {
  assert.throws(
    () =>
      parseCandidateStore({
        schemaVersion: "tripletex2.research-candidate-store.v1",
        updatedAt: "2026-03-21T20:00:00.000Z",
        entries: [
          {
            candidateId: "06.create-employee.v1",
            taskId: "06",
            strategyId: "06.create-employee.v1",
            status: "draft",
            notes: ["First."],
            createdAt: "2026-03-21T20:00:00.000Z",
            updatedAt: "2026-03-21T20:00:00.000Z",
          },
          {
            candidateId: "06.create-employee.v1",
            taskId: "06",
            strategyId: "06.create-employee.v1",
            status: "needs-review",
            notes: ["Duplicate."],
            createdAt: "2026-03-21T20:00:00.000Z",
            updatedAt: "2026-03-21T20:01:00.000Z",
          },
        ],
      }),
    /duplicate candidateId "06\.create-employee\.v1"/,
  );
});
