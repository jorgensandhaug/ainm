import assert from "node:assert/strict";
import test from "node:test";

import {
  NON_ELIGIBLE_TASK_POLICY_SCHEMA_VERSION,
  parseNonEligibleTaskPolicyConfig,
} from "./non-eligible-task-policy";

test("parseNonEligibleTaskPolicyConfig accepts explicit canonical task keys", () => {
  const config = parseNonEligibleTaskPolicyConfig({
    schemaVersion: NON_ELIGIBLE_TASK_POLICY_SCHEMA_VERSION,
    policyId: "policy-a",
    excludedCanonicalTasks: {
      "08": {
        reasonCode: "already-perfect",
        reason: "Canonical task 08 is already perfect.",
      },
    },
  });

  assert.deepEqual(config, {
    schemaVersion: NON_ELIGIBLE_TASK_POLICY_SCHEMA_VERSION,
    policyId: "policy-a",
    excludedCanonicalTasks: {
      "08": {
        reasonCode: "already-perfect",
        reason: "Canonical task 08 is already perfect.",
      },
    },
  });
});

test("parseNonEligibleTaskPolicyConfig rejects the old ambiguous field name", () => {
  assert.throws(
    () =>
      parseNonEligibleTaskPolicyConfig({
        schemaVersion: NON_ELIGIBLE_TASK_POLICY_SCHEMA_VERSION,
        policyId: "policy-a",
        excludedTasks: {},
      }),
    /excludedCanonicalTasks/,
  );
});
