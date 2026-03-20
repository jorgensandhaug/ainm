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
  assert.match(prompt, /create-and-send-invoice/);
});

test("adaptCodexTaskUnderstandingResult accepts newly implemented task surfaces", () => {
  const adapted = adaptCodexTaskUnderstandingResult(
    {
      status: "resolved",
      taskId: "create-employee",
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
    taskId: "create-employee",
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
      taskId: "create-and-send-invoice",
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
      'Extracted field "surpriseField" is not part of task "create-and-send-invoice".',
    taskId: "create-and-send-invoice",
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
