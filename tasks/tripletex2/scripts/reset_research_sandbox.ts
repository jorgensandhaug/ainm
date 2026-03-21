import path from "node:path";

import { loadSandboxCredentials } from "../src/sandbox-credentials";
import { runResearchSandboxReset } from "../src/research/sandbox-reset";
import { readJsonFile, tripletex2Root } from "../src/research/store";

async function main(): Promise<void> {
  const args = parseArgs(Bun.argv.slice(2));
  if (args.command !== "apply" || !args.taskId || !args.strategyId) {
    throw new Error(
      [
        "usage: bun scripts/reset_research_sandbox.ts apply --task <task-id> --strategy <strategy-id> [--input-file <json>]",
        "preferred: bun scripts/sandbox.ts reset [--task <task-id>] [--strategy <strategy-id>]",
      ].join("\n"),
    );
  }

  const credentials = await loadSandboxCredentials();
  if (!credentials) {
    throw new Error(
      "Sandbox credentials were not found in environment variables or tasks/tripletex2/.sandbox.env.",
    );
  }

  const input = args.inputFile
    ? await readJsonFile<Record<string, unknown>>(resolvePath(args.inputFile))
    : {};
  const result = await runResearchSandboxReset({
    taskId: args.taskId,
    strategyId: args.strategyId,
    input,
    credentials,
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.exitCode !== 0) {
    process.exit(result.exitCode);
  }
}

function parseArgs(argv: readonly string[]): {
  command?: string;
  taskId?: string;
  strategyId?: string;
  inputFile?: string;
} {
  const result: {
    command?: string;
    taskId?: string;
    strategyId?: string;
    inputFile?: string;
  } = {
    command: argv[0],
  };

  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag.startsWith("--") || value === undefined) {
      continue;
    }
    if (flag === "--task") {
      result.taskId = value;
      index += 1;
      continue;
    }
    if (flag === "--strategy") {
      result.strategyId = value;
      index += 1;
      continue;
    }
    if (flag === "--input-file") {
      result.inputFile = value;
      index += 1;
    }
  }

  return result;
}

function resolvePath(filePath: string): string {
  return path.isAbsolute(filePath)
    ? filePath
    : path.join(tripletex2Root, filePath);
}

await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
