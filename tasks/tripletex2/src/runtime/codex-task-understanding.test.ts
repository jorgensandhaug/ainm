import assert from "node:assert/strict";
import test from "node:test";

import { taskSpecs } from "../registry/tasks";
import {
  adaptCodexTaskUnderstandingResult,
  buildCodexTaskUnderstandingPrompt,
} from "./codex-task-understanding";

test("buildCodexTaskUnderstandingPrompt includes the request, files, and registered task surfaces", () => {
  const prompt = buildCodexTaskUnderstandingPrompt({
    request: {
      prompt: "Opprett og send fakturaen.",
      files: [
        {
          fileName: "note.txt",
          mediaType: "text/plain",
          textContent: "hello tripletex",
        },
      ],
    },
    taskSpecs,
  });

  assert.match(prompt, /Follow \.\/AGENTS\.md exactly\./);
  assert.match(prompt, /Registered task surfaces:/);
  assert.match(prompt, /Attachment text:/);
  assert.match(prompt, /hello tripletex/);
  assert.match(prompt, /"taskId": "08"/);
  assert.match(prompt, /"taskName": "Create and send invoice"/);
});

test("buildCodexTaskUnderstandingPrompt includes retry context with canonical remaining task ids", () => {
  const prompt = buildCodexTaskUnderstandingPrompt({
    request: {
      prompt: "Opprett fakturaen.",
      files: [],
    },
    taskSpecs,
    retryContext: {
      attemptNumber: 2,
      excludedTaskIds: ["08"],
      remainingTaskIds: ["01", "09"],
      rejectedTasks: [
        {
          taskId: "08",
          reasonCode: "already-perfect",
          reason: "Canonical task 08 is already perfect and non-eligible for live selection.",
        },
      ],
      unresolvedIsInvalid: true,
    },
  });

  assert.match(prompt, /Retry context:/);
  assert.match(prompt, /classifier retry attempt 2/);
  assert.match(prompt, /Excluded task ids for this retry: \["08"\]/);
  assert.match(prompt, /Remaining task ids for this retry: \["01","09"\]/);
  assert.match(
    prompt,
    /Do not return unresolved while any remaining task ids still exist/,
  );
  assert.match(prompt, /Canonical task 08 is already perfect/);
});

test("adaptCodexTaskUnderstandingResult accepts newly implemented task surfaces", () => {
  const adapted = adaptCodexTaskUnderstandingResult(
    {
      status: "resolved",
      taskId: "06",
      input: {
        employeeName: "Joao Rodrigues",
        birthDate: "1980-09-05",
        email: "joao.rodrigues@example.org",
        startDate: "2026-08-08",
      },
      notes: ["Matched the employee-creation prompt shape."],
    },
    taskSpecs,
  );

  assert.deepEqual(adapted.result, {
    status: "resolved",
    taskId: "06",
    input: {
      employeeName: "Joao Rodrigues",
      birthDate: "1980-09-05",
      email: "joao.rodrigues@example.org",
      startDate: "2026-08-08",
    },
  });
  assert.deepEqual(adapted.notes, [
    "Matched the employee-creation prompt shape.",
  ]);
});

test("adaptCodexTaskUnderstandingResult rejects fields outside the task surface", () => {
  const adapted = adaptCodexTaskUnderstandingResult(
    {
      status: "resolved",
      taskId: "08",
      input: {
        customerName: "Nordhav AS",
        organizationNumber: "876520427",
        lineDescription: "Analyserapport",
        quantity: 1,
        unitPriceExcludingVatNok: 7850,
        surpriseField: "nope",
      },
    },
    taskSpecs,
  );

  assert.deepEqual(adapted.result, {
    status: "unresolved",
    code: "invalid-field-value",
    message:
      'Extracted field "surpriseField" is not part of task "08".',
    taskId: "08",
    partialInput: {
      customerName: "Nordhav AS",
      organizationNumber: "876520427",
      lineDescription: "Analyserapport",
      quantity: 1,
      unitPriceExcludingVatNok: 7850,
      surpriseField: "nope",
    },
  });
});
