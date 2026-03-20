#!/usr/bin/env bun

import {
  listSupportedStoredRequestReplays,
  replayStoredRequestFixture,
} from "../src/runtime/stored-request-replay";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    process.stdout.write(
      `${JSON.stringify(listSupportedStoredRequestReplays(), null, 2)}\n`,
    );
    return;
  }

  if (!args.fixtureRef) {
    throw new Error(
      'Missing required "--fixture <id-or-path>" argument. Use "--list" to see supported stored request replays.',
    );
  }

  const result = await replayStoredRequestFixture({
    fixtureRef: args.fixtureRef,
    outputRoot: args.outputRoot,
    selectionConfigPath: args.selectionConfigPath,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        fixtureId: result.fixture.fixtureId,
        fixturePath: result.fixture.relativePath,
        artifactPath: result.artifactPath,
        taskId: result.artifact.task.taskId,
        taskSource: result.artifact.task.taskSource,
        inputSource: result.artifact.input.source,
        notes: result.artifact.analysis?.notes ?? [],
      },
      null,
      2,
    )}\n`,
  );
}

function parseArgs(argv: readonly string[]): {
  fixtureRef?: string;
  outputRoot?: string;
  selectionConfigPath?: string;
  list: boolean;
} {
  let fixtureRef: string | undefined;
  let outputRoot: string | undefined;
  let selectionConfigPath: string | undefined;
  let list = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--fixture") {
      fixtureRef = requireValue(arg, next);
      index += 1;
      continue;
    }

    if (arg === "--output-root") {
      outputRoot = requireValue(arg, next);
      index += 1;
      continue;
    }

    if (arg === "--selection-config") {
      selectionConfigPath = requireValue(arg, next);
      index += 1;
      continue;
    }

    if (arg === "--list") {
      list = true;
      continue;
    }

    throw new Error(`Unknown argument "${arg}".`);
  }

  return {
    fixtureRef,
    outputRoot,
    selectionConfigPath,
    list,
  };
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Flag "${flag}" requires a value.`);
  }

  return value;
}

void main();
