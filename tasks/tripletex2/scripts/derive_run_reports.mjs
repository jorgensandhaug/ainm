#!/usr/bin/env node

import path from "node:path";

import {
  formatRunReportSummary,
  writeRunReports,
} from "./lib/derive-run-reports.mjs";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const derived = await writeRunReports(options);

  console.log(formatRunReportSummary(derived));
  console.log(`Reports written to ${path.relative(process.cwd(), derived.reportsDir) || "."}`);
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--runs-dir":
        options.runsDir = requireValue(argv, index, arg);
        index += 1;
        break;
      case "--reports-dir":
        options.reportsDir = requireValue(argv, index, arg);
        index += 1;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function requireValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function printHelp() {
  console.log(
    [
      "Usage: node scripts/derive_run_reports.mjs [options]",
      "",
      "Options:",
      "  --runs-dir <path>     Canonical runs directory. Default: ./runs",
      "  --reports-dir <path>  Output directory for derived reports. Default: ./reports",
      "  -h, --help            Show this help text",
    ].join("\n"),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
