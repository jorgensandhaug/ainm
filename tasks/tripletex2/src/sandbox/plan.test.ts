import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { TripletexClient } from "../runtime/contracts";
import { applySandboxPlan } from "./plan";
import type { SandboxPlan } from "./types";

test("applySandboxPlan templates captured ids into later steps without stringifying them", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "tripletex2-sandbox-plan-"));
  const seenBodies: unknown[] = [];
  const client: TripletexClient = {
    async get() {
      throw new Error("Unexpected GET");
    },
    async post(requestPath, options) {
      seenBodies.push(options?.body);
      if (requestPath === "/customer") {
        return {
          value: {
            id: 101,
          },
        };
      }
      if (requestPath === "/project") {
        return {
          value: {
            id: 202,
          },
        };
      }
      throw new Error(`Unexpected POST ${requestPath}`);
    },
    async put() {
      throw new Error("Unexpected PUT");
    },
    async delete() {
      throw new Error("Unexpected DELETE");
    },
  };
  const plan: SandboxPlan = {
    schemaVersion: "tripletex2.sandbox-plan.v1",
    planId: "template-check",
    steps: [
      {
        stepId: "create-customer",
        method: "POST",
        path: "/customer",
        body: {
          name: "Fixture Customer",
        },
        capture: {
          customerId: "value.id",
        },
      },
      {
        stepId: "create-project",
        method: "POST",
        path: "/project",
        body: {
          name: "Fixture Project",
          customer: {
            id: "{{customerId}}",
          },
        },
      },
    ],
  };

  const result = await applySandboxPlan({
    plan,
    credentials: {
      base_url: "https://sandbox.example.invalid/v2",
      session_token: "secret",
    },
    client,
    reportRoot: tempRoot,
  });

  assert.equal(typeof (seenBodies[1] as any).customer.id, "number");
  assert.equal((seenBodies[1] as any).customer.id, 101);
  assert.deepEqual(
    result.report.createdRefs.map((ref) => [ref.entityType, ref.entityId]),
    [
      ["customer", 101],
      ["project", 202],
    ],
  );
});
