import assert from "node:assert/strict";
import test from "node:test";

import { collectKnownFailureModes } from "./packet-builder";

test("collectKnownFailureModes extracts concrete validation and avoidance lines", () => {
  const failureModes = collectKnownFailureModes([
    `
- Do not pre-read department in fresh-account scored runs.
- direct POST /employee can fail with 422 department.id.
- Successful create can still require GET /employee/employment.
`,
  ]);

  assert.deepEqual(failureModes, [
    "Do not pre-read department in fresh-account scored runs.",
    "direct POST /employee can fail with 422 department.id.",
    "Successful create can still require GET /employee/employment.",
  ]);
});
