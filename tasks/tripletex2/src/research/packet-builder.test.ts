import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildTaskPacket, collectKnownFailureModes } from "./packet-builder";

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

test("buildTaskPacket exposes optimization objective and context locator for manual launches", async () => {
  const packetRoot = await mkdtemp(
    path.join(os.tmpdir(), "tripletex2-packet-builder-"),
  );
  const now = new Date("2026-03-21T22:00:00.000Z");

  const { packet, packetPath } = await buildTaskPacket({
    taskId: "11",
    packetRoot,
    now: () => now,
  });

  assert.equal(packet.optimizationObjective.currentBestKnownScore, 1);
  assert.equal(packet.optimizationObjective.maxScore, 4);
  assert.equal(packet.optimizationObjective.scoreGap, 3);
  assert.equal(packet.optimizationObjective.bestKnownCallBudget, 5);
  assert.equal(packet.optimizationObjective.baselineCallBudget, 5);
  assert.equal(
    packet.optimizationObjective.activeStrategyToBeat?.strategyId,
    "11.order-invoice-combined-payment.v1",
  );
  assert.match(
    packet.optimizationObjective.improvementRequirement,
    /no plausible improvement was found/,
  );
  assert.equal(
    packet.contextLocator.researchInstructionsPath,
    path.join(process.cwd(), "research", "AGENTS.md"),
  );
  assert.equal(
    packet.contextLocator.taskSurface.taskImplementationPath,
    path.join(process.cwd(), "src", "tasks", "task-11", "task.ts"),
  );
  assert.equal(
    packet.contextLocator.proof.inputPath,
    path.join(
      process.cwd(),
      "research",
      "proofs",
      "task-11",
      "task-11-proof-input.json",
    ),
  );
  assert.equal(
    packet.contextLocator.proof.verificationPlanSourcePath,
    path.join(process.cwd(), "src", "research", "verification-plan.ts"),
  );
  assert.equal(
    packet.contextLocator.proof.verificationCommand,
    [
      "bun scripts/research_os.ts verify",
      `--packet ${packetPath}`,
      "--strategy <strategy-id>",
      `--input-file ${path.join(
        process.cwd(),
        "research",
        "proofs",
        "task-11",
        "task-11-proof-input.json",
      )}`,
    ].join(" "),
  );
  assert.equal(
    packet.contextLocator.runtimeEvidence.openapiPath,
    path.join(process.cwd(), "openapi.json"),
  );
  assert.ok(
    packet.contextLocator.offlineEvidence.additionalEvidencePaths.length === 0,
  );

  const writtenPacket = JSON.parse(await readFile(packetPath, "utf8")) as {
    optimizationObjective?: { bestKnownCallBudget?: number };
    contextLocator?: { proof?: { verificationCommand?: string } };
  };
  assert.equal(writtenPacket.optimizationObjective?.bestKnownCallBudget, 5);
  assert.equal(
    writtenPacket.contextLocator?.proof?.verificationCommand,
    packet.contextLocator.proof.verificationCommand,
  );
});
