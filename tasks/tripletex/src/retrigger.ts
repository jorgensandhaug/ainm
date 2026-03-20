import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

type TripletexSolveFile = {
  filename: string;
  content_base64: string;
  mime_type: string;
};

type TripletexCredentials = {
  base_url: string;
  session_token: string;
};

type SolveRequest = {
  prompt: string;
  files?: TripletexSolveFile[];
  tripletex_credentials: TripletexCredentials;
};

type FixtureRequest = {
  prompt: string;
  files?: TripletexSolveFile[];
  tripletex_credentials?: TripletexCredentials;
};

type RunRecord = {
  request: SolveRequest;
  requestPath: string;
  runDir: string;
  runId: string;
  storageMode: "testing" | "production";
};

type FixtureRecord = {
  fixtureName: string;
  fixturePath: string;
  request: FixtureRequest;
};

const tripletexRootDir = resolve(import.meta.dir, "..");
const dataRootDir = join(tripletexRootDir, "data");
const fixturesDir = join(tripletexRootDir, "fixtures");
const sandboxEnvPath = join(tripletexRootDir, ".sandbox.env");
const defaultSolveUrl =
  Bun.env.TRIPLETEX_SOLVE_URL ?? `http://127.0.0.1:${Bun.env.PORT ?? "3000"}/solve`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSolveFile(value: unknown): value is TripletexSolveFile {
  return (
    isRecord(value) &&
    typeof value.filename === "string" &&
    typeof value.content_base64 === "string" &&
    typeof value.mime_type === "string"
  );
}

function isTripletexCredentials(value: unknown): value is TripletexCredentials {
  return (
    isRecord(value) &&
    typeof value.base_url === "string" &&
    typeof value.session_token === "string"
  );
}

function isFixtureRequest(value: unknown): value is FixtureRequest {
  if (!isRecord(value) || typeof value.prompt !== "string") {
    return false;
  }

  if (value.files !== undefined && (!Array.isArray(value.files) || !value.files.every(isSolveFile))) {
    return false;
  }

  return value.tripletex_credentials === undefined || isTripletexCredentials(value.tripletex_credentials);
}

function isSolveRequest(value: unknown): value is SolveRequest {
  return isFixtureRequest(value) && isTripletexCredentials(value.tripletex_credentials);
}

function summarizePrompt(prompt: string): string {
  const singleLine = prompt.replace(/\s+/g, " ").trim();
  return singleLine.length > 72 ? `${singleLine.slice(0, 69)}...` : singleLine;
}

function parseEnvFile(raw: string): Record<string, string> {
  const env: Record<string, string> = {};

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      env[key] = value;
    }
  }

  return env;
}

async function loadSandboxCredentials(): Promise<TripletexCredentials | undefined> {
  const baseUrl = Bun.env.TRIPLETEX_TEST_BASE_URL;
  const sessionToken = Bun.env.TRIPLETEX_TEST_SESSION_TOKEN;
  if (baseUrl && sessionToken) {
    return {
      base_url: baseUrl,
      session_token: sessionToken,
    };
  }

  try {
    const raw = await readFile(sandboxEnvPath, "utf8");
    const env = parseEnvFile(raw);
    if (env.TRIPLETEX_TEST_BASE_URL && env.TRIPLETEX_TEST_SESSION_TOKEN) {
      return {
        base_url: env.TRIPLETEX_TEST_BASE_URL,
        session_token: env.TRIPLETEX_TEST_SESSION_TOKEN,
      };
    }
  } catch {
    // ignore missing local sandbox file
  }

  return undefined;
}

async function readRunsForMode(storageMode: "testing" | "production"): Promise<RunRecord[]> {
  const runsDir = join(dataRootDir, storageMode, "runs");
  let entries: string[] = [];

  try {
    entries = (await readdir(runsDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();
  } catch {
    return [];
  }

  const runs: RunRecord[] = [];
  for (const runId of entries) {
    const runDir = join(runsDir, runId);
    const requestPath = join(runDir, "request.json");

    try {
      const raw = await readFile(requestPath, "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (!isSolveRequest(parsed)) {
        continue;
      }

      runs.push({
        request: parsed,
        requestPath,
        runDir,
        runId,
        storageMode,
      });
    } catch {
      continue;
    }
  }

  return runs;
}

async function loadRuns(): Promise<RunRecord[]> {
  const runs = [
    ...(await readRunsForMode("testing")),
    ...(await readRunsForMode("production")),
  ];

  return runs.sort((a, b) => b.runId.localeCompare(a.runId));
}

async function loadFixtures(): Promise<FixtureRecord[]> {
  let entries: string[] = [];

  try {
    entries = (await readdir(fixturesDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }

  const fixtures: FixtureRecord[] = [];
  for (const entry of entries) {
    const fixturePath = join(fixturesDir, entry);

    try {
      const raw = await readFile(fixturePath, "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (!isFixtureRequest(parsed)) {
        continue;
      }

      fixtures.push({
        fixtureName: entry.replace(/\.json$/, ""),
        fixturePath,
        request: parsed,
      });
    } catch {
      continue;
    }
  }

  return fixtures;
}

function printRuns(runs: RunRecord[]): void {
  for (const [index, run] of runs.entries()) {
    const fileCount = run.request.files?.length ?? 0;
    console.log(
      `${index + 1}. [${run.storageMode}] ${run.runId} | files:${fileCount} | ${summarizePrompt(run.request.prompt)}`,
    );
  }
}

function printFixtures(fixtures: FixtureRecord[]): void {
  for (const [index, fixture] of fixtures.entries()) {
    const fileCount = fixture.request.files?.length ?? 0;
    console.log(
      `${index + 1}. ${fixture.fixtureName} | files:${fileCount} | ${summarizePrompt(fixture.request.prompt)}`,
    );
  }
}

function selectRunFromToken(runs: RunRecord[], token: string): RunRecord | undefined {
  const numeric = Number(token);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= runs.length) {
    return runs[numeric - 1];
  }

  const exactMatch = runs.find((run) => run.runId === token);
  if (exactMatch) {
    return exactMatch;
  }

  const partialMatches = runs.filter((run) => run.runId.includes(token));
  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  if (partialMatches.length > 1) {
    throw new Error(`multiple runs matched "${token}"`);
  }

  return undefined;
}

function selectFixtureFromToken(fixtures: FixtureRecord[], token: string): FixtureRecord | undefined {
  const numeric = Number(token);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= fixtures.length) {
    return fixtures[numeric - 1];
  }

  const exactMatch = fixtures.find((fixture) => fixture.fixtureName === token);
  if (exactMatch) {
    return exactMatch;
  }

  const partialMatches = fixtures.filter((fixture) => fixture.fixtureName.includes(token));
  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  if (partialMatches.length > 1) {
    throw new Error(`multiple fixtures matched "${token}"`);
  }

  return undefined;
}

async function chooseMode(runs: RunRecord[], fixtures: FixtureRecord[]): Promise<"run" | "fixture"> {
  const mode = Bun.argv[2];
  if (mode === "run" || mode === "fixture") {
    return mode;
  }

  if (runs.length === 0 && fixtures.length > 0) {
    return "fixture";
  }

  if (fixtures.length === 0 && runs.length > 0) {
    return "run";
  }

  const answer = prompt("Choose mode: run or fixture")?.trim().toLowerCase();
  if (answer === "run" || answer === "fixture") {
    return answer;
  }

  throw new Error("no mode selected");
}

async function chooseRun(runs: RunRecord[]): Promise<RunRecord> {
  const token = Bun.argv[3];
  if (token) {
    const selected = selectRunFromToken(runs, token);
    if (!selected) {
      throw new Error(`no run matched "${token}"`);
    }
    return selected;
  }

  printRuns(runs);
  const answer = prompt("Choose run number or run id:")?.trim();
  if (!answer) {
    throw new Error("no run selected");
  }

  const selected = selectRunFromToken(runs, answer);
  if (!selected) {
    throw new Error(`no run matched "${answer}"`);
  }

  return selected;
}

async function chooseFixture(fixtures: FixtureRecord[]): Promise<FixtureRecord> {
  const token = Bun.argv[3];
  if (token) {
    const selected = selectFixtureFromToken(fixtures, token);
    if (!selected) {
      throw new Error(`no fixture matched "${token}"`);
    }
    return selected;
  }

  printFixtures(fixtures);
  const answer = prompt("Choose fixture number or fixture name:")?.trim();
  if (!answer) {
    throw new Error("no fixture selected");
  }

  const selected = selectFixtureFromToken(fixtures, answer);
  if (!selected) {
    throw new Error(`no fixture matched "${answer}"`);
  }

  return selected;
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (Bun.env.API_KEY) {
    headers.authorization = `Bearer ${Bun.env.API_KEY}`;
  }

  return headers;
}

async function postSolveRequest(request: SolveRequest): Promise<void> {
  const response = await fetch(defaultSolveUrl, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(request),
  });

  const text = await response.text();
  console.log(`status: ${response.status}`);
  console.log(text);

  if (!response.ok) {
    process.exitCode = 1;
  }
}

async function retriggerRun(run: RunRecord): Promise<void> {
  console.log(`retriggering run ${run.runId}`);
  console.log(`source request: ${run.requestPath}`);
  console.log(`target: ${defaultSolveUrl}`);
  await postSolveRequest(run.request);
}

async function runFixture(fixture: FixtureRecord): Promise<void> {
  const fixtureCredentials = fixture.request.tripletex_credentials ?? (await loadSandboxCredentials());
  if (!fixtureCredentials) {
    throw new Error(
      `fixture ${fixture.fixtureName} has no credentials and no sandbox credentials were found`,
    );
  }

  const request: SolveRequest = {
    prompt: fixture.request.prompt,
    ...(fixture.request.files ? { files: fixture.request.files } : {}),
    tripletex_credentials: fixtureCredentials,
  };

  console.log(`running fixture ${fixture.fixtureName}`);
  console.log(`source fixture: ${fixture.fixturePath}`);
  console.log(`target: ${defaultSolveUrl}`);
  await postSolveRequest(request);
}

async function main(): Promise<void> {
  const runs = await loadRuns();
  const fixtures = await loadFixtures();
  const mode = await chooseMode(runs, fixtures);

  if (mode === "run") {
    if (runs.length === 0) {
      throw new Error(`no stored runs found under ${dataRootDir}`);
    }
    const selectedRun = await chooseRun(runs);
    await retriggerRun(selectedRun);
    return;
  }

  if (fixtures.length === 0) {
    throw new Error(`no fixture files found under ${fixturesDir}`);
  }

  const selectedFixture = await chooseFixture(fixtures);
  await runFixture(selectedFixture);
}

await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
