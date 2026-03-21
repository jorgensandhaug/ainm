import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  TaskUnderstandingResolved,
  TripletexCredentialCompanyId,
  TripletexFetch,
  TripletexFetchResponse,
} from "./contracts";
import {
  runCompetitionSolvePipeline,
  type CompetitionSolveRequest,
  type ProvidedTaskUnderstanding,
  type SolvePipelineOptions,
  type SolvePipelineResult,
} from "./solve-pipeline";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const TRAIN_REQUESTS_ROOT = path.join(REPO_ROOT, "train_requests");
const DEFAULT_FIXTURE_BASE_URL = "https://example.invalid";
const DEFAULT_FIXTURE_SESSION_TOKEN = "fixture-replay-token";
const DEFAULT_FIXTURE_CREDENTIAL_SOURCE =
  "fixture-replay:redacted-train-request-override";

interface StoredRequestJsonFile {
  filename: string;
  content_base64: string;
  mime_type?: string;
}

interface StoredRequestJson {
  prompt: string;
  files?: readonly StoredRequestJsonFile[];
  tripletex_credentials?: {
    base_url?: string;
    session_token?: string;
    company_id?: TripletexCredentialCompanyId;
  };
}

interface ReplayFixtureDefinition {
  description: string;
  taskUnderstanding: ProvidedTaskUnderstanding<Record<string, unknown>, string>;
  credentialOverrides?: Partial<CompetitionSolveRequest["tripletex_credentials"]>;
  createFetch(): TripletexFetch;
}

export interface StoredRequestFixture {
  fixtureId: string;
  relativePath: string;
  absolutePath: string;
}

export interface SupportedStoredRequestReplay {
  fixtureId: string;
  relativePath: string;
  taskId: string;
  description: string;
}

export interface ReplayStoredRequestFixtureOptions
  extends Omit<SolvePipelineOptions, "fetch" | "mode" | "taskUnderstanding"> {
  fixtureRef: string;
}

export interface ReplayStoredRequestFixtureResult extends SolvePipelineResult {
  fixture: StoredRequestFixture;
  request: CompetitionSolveRequest;
  taskUnderstanding: ProvidedTaskUnderstanding<Record<string, unknown>, string>;
}

const replayFixtureDefinitions = new Map<string, ReplayFixtureDefinition>([
  [
    "prod-2026-03-19-202404144Z-b7918145",
    {
      description:
        "Create-and-send-invoice replay using explicit fixture metadata and fixture-scoped Tripletex responses.",
      taskUnderstanding: {
        result: {
          status: "resolved",
          taskId: "08",
          input: {
            customerName: "Nordhav AS",
            organizationNumber: "876520427",
            lineDescription: "Analyserapport",
            quantity: 1,
            unitPriceExcludingVatNok: 7850,
          },
        } satisfies TaskUnderstandingResolved<Record<string, unknown>, string>,
        taskSource: "replay-label",
        inputSource: "fixture",
        notes: [
          'Stored request replay used fixture metadata to label "train_requests/prod-2026-03-19-202404144Z-b7918145.json" as create-and-send-invoice and to provide structured input fields; no classifier/extractor ran.',
          "Stored request credentials are redacted in train_requests/, so this replay uses fixture-scoped Tripletex HTTP responses instead of live network calls.",
        ],
      },
      credentialOverrides: {
        base_url: DEFAULT_FIXTURE_BASE_URL,
        session_token: DEFAULT_FIXTURE_SESSION_TOKEN,
        credential_source: DEFAULT_FIXTURE_CREDENTIAL_SOURCE,
      },
      createFetch: createCreateAndSendInvoiceReplayFetch,
    },
  ],
]);

export async function listStoredRequestFixtures(): Promise<
  readonly StoredRequestFixture[]
> {
  const entries = await readdir(TRAIN_REQUESTS_ROOT, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => ({
      fixtureId: stripJsonExtension(entry.name),
      relativePath: path.posix.join("train_requests", entry.name),
      absolutePath: path.join(TRAIN_REQUESTS_ROOT, entry.name),
    }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export async function resolveStoredRequestFixture(
  fixtureRef: string,
): Promise<StoredRequestFixture> {
  const fixtures = await listStoredRequestFixtures();
  const normalizedRef = normalizePathLike(fixtureRef);
  const normalizedAbsoluteRef = path.normalize(path.resolve(fixtureRef));
  const matched = fixtures.filter((fixture) => {
    const fixtureBaseName = path.posix.basename(fixture.relativePath);

    return (
      fixture.fixtureId === normalizedRef ||
      fixture.relativePath === normalizedRef ||
      fixtureBaseName === normalizedRef ||
      stripJsonExtension(fixtureBaseName) === stripJsonExtension(normalizedRef) ||
      path.normalize(fixture.absolutePath) === normalizedAbsoluteRef
    );
  });

  if (matched.length === 1) {
    return matched[0];
  }

  if (matched.length > 1) {
    throw new Error(
      `Stored request fixture reference "${fixtureRef}" matched multiple fixtures.`,
    );
  }

  throw new Error(
    `Stored request fixture "${fixtureRef}" was not found under ${TRAIN_REQUESTS_ROOT}.`,
  );
}

export async function loadStoredCompetitionRequestFixture(
  fixtureOrRef: StoredRequestFixture | string,
  options: {
    credentialOverrides?: Partial<CompetitionSolveRequest["tripletex_credentials"]>;
  } = {},
): Promise<CompetitionSolveRequest> {
  const fixture =
    typeof fixtureOrRef === "string"
      ? await resolveStoredRequestFixture(fixtureOrRef)
      : fixtureOrRef;
  const raw = JSON.parse(
    await readFile(fixture.absolutePath, "utf8"),
  ) as StoredRequestJson;
  const storedCredentials = raw.tripletex_credentials ?? {};
  const baseUrl =
    options.credentialOverrides?.base_url ??
    sanitizeStoredCredential(storedCredentials.base_url) ??
    DEFAULT_FIXTURE_BASE_URL;
  const sessionToken =
    options.credentialOverrides?.session_token ??
    sanitizeStoredCredential(storedCredentials.session_token) ??
    DEFAULT_FIXTURE_SESSION_TOKEN;

  return {
    prompt: raw.prompt,
    files: (raw.files ?? []).map((file) => ({
      fileName: file.filename,
      textContent: Buffer.from(file.content_base64, "base64").toString("utf8"),
      mediaType: file.mime_type,
    })),
    tripletex_credentials: {
      base_url: baseUrl,
      session_token: sessionToken,
      company_id:
        options.credentialOverrides?.company_id ?? storedCredentials.company_id,
      credential_source:
        options.credentialOverrides?.credential_source ??
        (sanitizeStoredCredential(storedCredentials.base_url) &&
        sanitizeStoredCredential(storedCredentials.session_token)
          ? "stored-request"
          : DEFAULT_FIXTURE_CREDENTIAL_SOURCE),
    },
  };
}

export function listSupportedStoredRequestReplays(): readonly SupportedStoredRequestReplay[] {
  return Array.from(replayFixtureDefinitions.entries())
    .map(([fixtureId, definition]) => ({
      fixtureId,
      relativePath: `train_requests/${fixtureId}.json`,
      taskId: definition.taskUnderstanding.result.taskId,
      description: definition.description,
    }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export async function replayStoredRequestFixture(
  options: ReplayStoredRequestFixtureOptions,
): Promise<ReplayStoredRequestFixtureResult> {
  const fixture = await resolveStoredRequestFixture(options.fixtureRef);
  const definition = replayFixtureDefinitions.get(fixture.fixtureId);

  if (!definition) {
    throw new Error(
      `Stored request fixture "${fixture.relativePath}" does not have replay metadata yet.`,
    );
  }

  const request = await loadStoredCompetitionRequestFixture(fixture, {
    credentialOverrides: definition.credentialOverrides,
  });
  const result = await runCompetitionSolvePipeline(request, {
    ...options,
    mode: "replay",
    fetch: definition.createFetch(),
    taskUnderstanding: definition.taskUnderstanding,
  });

  return {
    ...result,
    fixture,
    request,
    taskUnderstanding: definition.taskUnderstanding,
  };
}

function normalizePathLike(value: string): string {
  return value.replace(/\\/g, "/");
}

function sanitizeStoredCredential(value: string | undefined): string | undefined {
  if (!value || value === "REDACTED") {
    return undefined;
  }

  return value;
}

function stripJsonExtension(value: string): string {
  return value.endsWith(".json") ? value.slice(0, -".json".length) : value;
}

function createCreateAndSendInvoiceReplayFetch(): TripletexFetch {
  return async (input, init) => {
    const url = new URL(input);

    if (init.method === "GET" && url.pathname === "/customer") {
      return createResponse(200, {
        values: [
          {
            id: 42,
            name: "Nordhav AS",
            organizationNumber: "876520427",
            invoiceSendMethod: "EMAIL",
          },
        ],
      });
    }

    if (init.method === "GET" && url.pathname === "/ledger/vatType") {
      return createResponse(200, {
        values: [
          {
            id: 3,
            percentage: 25,
          },
        ],
      });
    }

    if (init.method === "POST" && url.pathname === "/invoice") {
      return createResponse(200, {
        value: {
          id: 9001,
          invoiceNumber: 110045,
        },
      });
    }

    if (init.method === "PUT" && url.pathname === "/invoice/9001/:send") {
      return createResponse(200, {});
    }

    throw new Error(
      `Unexpected Tripletex replay fixture request: ${init.method} ${url.pathname}`,
    );
  };
}

function createResponse(
  status: number,
  body: unknown,
): TripletexFetchResponse {
  return {
    status,
    headers: {
      get() {
        return null;
      },
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}
