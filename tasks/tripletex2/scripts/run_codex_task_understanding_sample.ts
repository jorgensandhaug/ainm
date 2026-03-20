#!/usr/bin/env bun

import { taskSpecs } from "../src/registry/tasks";
import { runCodexTaskUnderstanding } from "../src/runtime/codex-task-understanding";

async function main(): Promise<void> {
  const prompt =
    process.argv.slice(2).join(" ").trim() ||
    "Opprett og send en faktura til kunden Nordhav AS (org.nr 876520427) på 7850 kr eksklusiv MVA. Fakturaen gjelder Analyserapport.";

  const result = await runCodexTaskUnderstanding({
    request: {
      prompt,
      files: [],
    },
    taskSpecs,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        result: result.result,
        notes: result.notes,
      },
      null,
      2,
    )}\n`,
  );
}

void main();
