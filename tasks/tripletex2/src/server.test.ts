import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type {
  TaskUnderstandingResolved,
  TripletexFetch,
  TripletexFetchResponse,
} from "./runtime/contracts";
import { createSolveRequestHandler } from "./server";

test("POST /solve writes staging plus a canonical success artifact and respects caller run identity", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "tripletex2-server-"));
  const handler = createSolveRequestHandler({
    bearerToken: "secret-token",
    mode: "sandbox",
    solveBackend: "deterministic",
    now: () => new Date("2026-03-20T23:00:00.000Z"),
    createRunId: () => "sandbox-http-success",
    dataRoot: path.join(tempRoot, "data"),
    artifactRoot: path.join(tempRoot, "runs"),
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
      taskSource: "manual-label",
      inputSource: "fixture",
      notes: ["HTTP success fixture."],
    },
    fetch: createFixtureTripletexFetch(),
    logger() {
      // Silence test logs.
    },
  });
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const response = await handler(
    createSolveRequest({
      authorization: "Bearer secret-token",
      requestId: "req-http-success",
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "completed" });
  assert.equal(response.headers.get("x-request-id"), "req-http-success");
  assert.equal(response.headers.get("x-tripletex2-run-id"), "sandbox-http-success");
  assert.equal(
    response.headers.get("x-tripletex2-runtime-status"),
    "completed",
  );

  const artifactPath = path.join(
    tempRoot,
    "runs",
    "2026-03-20",
    "run-sandbox-http-success.json",
  );
  const tracePath = path.join(
    tempRoot,
    "runs",
    "2026-03-20",
    "run-sandbox-http-success.trace.json",
  );
  const stageDirectory = path.join(
    tempRoot,
    "data",
    "sandbox",
    "runs",
    "sandbox-http-success",
  );

  await stat(artifactPath);
  await stat(tracePath);
  await stat(path.join(stageDirectory, "request.json"));
  await stat(path.join(stageDirectory, "result.json"));

  const stageRequest = JSON.parse(
    await readFile(path.join(stageDirectory, "request.json"), "utf8"),
  ) as {
    requestId: string;
    request: {
      tripletexCredentials: Record<string, unknown>;
    };
  };
  assert.equal(stageRequest.requestId, "req-http-success");
  assert.equal(
    "session_token" in stageRequest.request.tripletexCredentials,
    false,
  );

  const stageResult = JSON.parse(
    await readFile(path.join(stageDirectory, "result.json"), "utf8"),
  ) as {
    artifactPath: string;
    runtimeStatus: string;
  };
  assert.equal(stageResult.artifactPath, artifactPath);
  assert.equal(stageResult.runtimeStatus, "completed");
});

test("POST /solve returns after writing a canonical not-run artifact for unresolved task understanding", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "tripletex2-server-"));
  const handler = createSolveRequestHandler({
    bearerToken: "secret-token",
    mode: "sandbox",
    solveBackend: "deterministic",
    now: () => new Date("2026-03-20T23:10:00.000Z"),
    createRunId: () => "sandbox-http-unresolved",
    dataRoot: path.join(tempRoot, "data"),
    artifactRoot: path.join(tempRoot, "runs"),
    classifierExtractor: async () => ({
      status: "unresolved",
      code: "ambiguous-task",
      message: "The prompt could describe multiple Tripletex tasks.",
    }),
    logger() {
      // Silence test logs.
    },
  });
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const response = await handler(
    createSolveRequest({
      authorization: "Bearer secret-token",
      requestId: "req-http-unresolved",
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "completed" });
  assert.equal(response.headers.get("x-tripletex2-runtime-status"), "not-run");

  const artifactPath = path.join(
    tempRoot,
    "runs",
    "2026-03-20",
    "run-sandbox-http-unresolved.json",
  );
  const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as {
    input: { status: string };
    execution: { runtimeStatus: string };
  };
  assert.equal(artifact.input.status, "ambiguous");
  assert.equal(artifact.execution.runtimeStatus, "not-run");
});

test("POST /solve enforces bearer auth", async () => {
  const handler = createSolveRequestHandler({
    bearerToken: "secret-token",
    logger() {
      // Silence test logs.
    },
  });

  const response = await handler(
    createSolveRequest({
      authorization: "Bearer wrong-token",
    }),
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "Invalid bearer token.",
  });
});

test("POST /solve enforces the concurrency limit", async () => {
  let signalFirstRequestStarted!: () => void;
  let releaseFirstRequest!: () => void;
  const firstRequestStarted = new Promise<void>((resolve) => {
    signalFirstRequestStarted = resolve;
  });
  const firstRequestReleased = new Promise<void>((resolve) => {
    releaseFirstRequest = resolve;
  });
  const blockingFetch: TripletexFetch = async (input, init) => {
    const url = new URL(input);
    if (init.method === "GET" && url.pathname === "/customer") {
      signalFirstRequestStarted();
      await firstRequestReleased;
      return createResponse(200, {
        values: [
          {
            id: 42,
            name: "Nordhav AS",
            organizationNumber: "876520427",
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

    throw new Error(`Unexpected Tripletex fixture request: ${init.method} ${url.pathname}`);
  };

  const handler = createSolveRequestHandler({
    bearerToken: "secret-token",
    solveBackend: "deterministic",
    maxConcurrentSolveRequests: 1,
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
      taskSource: "manual-label",
      inputSource: "fixture",
    },
    fetch: blockingFetch,
    logger() {
      // Silence test logs.
    },
  });

  const firstResponsePromise = handler(
    createSolveRequest({
      authorization: "Bearer secret-token",
      requestId: "req-http-concurrency-1",
    }),
  );
  await firstRequestStarted;

  const secondResponse = await handler(
    createSolveRequest({
      authorization: "Bearer secret-token",
      requestId: "req-http-concurrency-2",
    }),
  );

  assert.equal(secondResponse.status, 503);
  assert.deepEqual(await secondResponse.json(), {
    error: "Server is at solve concurrency limit.",
  });

  releaseFirstRequest();
  const firstResponse = await firstResponsePromise;
  assert.equal(firstResponse.status, 200);
});

test("POST /solve in sandbox mode falls back to .sandbox.env credentials for placeholder requests", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "tripletex2-server-"));
  const sandboxEnvPath = path.join(tempRoot, ".sandbox.env");
  await writeFile(
    sandboxEnvPath,
    [
      "TRIPLETEX_TEST_BASE_URL=https://sandbox-file.invalid/v2",
      "TRIPLETEX_TEST_SESSION_TOKEN=sandbox-session-token",
      "",
    ].join("\n"),
  );
  const seenRequests: Array<{ url: string; authorization: string | undefined }> = [];
  const handler = createSolveRequestHandler({
    bearerToken: "secret-token",
    mode: "sandbox",
    solveBackend: "deterministic",
    sandboxEnvPath,
    now: () => new Date("2026-03-20T23:20:00.000Z"),
    createRunId: () => "sandbox-http-fallback",
    dataRoot: path.join(tempRoot, "data"),
    artifactRoot: path.join(tempRoot, "runs"),
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
      taskSource: "manual-label",
      inputSource: "fixture",
    },
    fetch: async (input, init) => {
      seenRequests.push({
        url: input,
        authorization:
          init.headers.Authorization ??
          init.headers.authorization,
      });
      return createFixtureTripletexFetch()(input, init);
    },
    logger() {
      // Silence test logs.
    },
  });
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const response = await handler(
    createSolveRequest({
      authorization: "Bearer secret-token",
      requestId: "req-http-fallback",
      tripletexCredentials: {
        base_url: "",
        session_token: "replace-me",
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(seenRequests.length > 0, true);
  assert.equal(seenRequests[0]?.url.startsWith("https://sandbox-file.invalid/v2/"), true);
  assert.equal(
    seenRequests[0]?.authorization,
    `Basic ${Buffer.from("0:sandbox-session-token").toString("base64")}`,
  );

  const artifactPath = path.join(
    tempRoot,
    "runs",
    "2026-03-20",
    "run-sandbox-http-fallback.json",
  );
  const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as {
    request: { credentialSource?: string };
  };
  assert.equal(artifact.request.credentialSource, "sandbox");
});

test(
  "POST /solve in sandbox mode uses the tmux backend and waits for task_complete",
  { concurrency: false },
  async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "tripletex2-server-"));
  const dataRoot = path.join(tempRoot, "data");
  const codexHomeDir = path.join(tempRoot, ".codex");
  const codexEnvironmentDir = "/repo/tasks/tripletex2/codex-environment";
  const tmuxCommands: string[][] = [];
  let leaderboardFetchCount = 0;
  const handler = createSolveRequestHandler({
    bearerToken: "secret-token",
    mode: "sandbox",
    codexEnvironmentDir,
    codexHomeDir,
    createRunId: () => "test-http-tmux",
    dataRoot,
    env: {
      CODEX_HOME: codexHomeDir,
      HOME: tempRoot,
      TRIPLETEX_LEADERBOARD_DELAY_MS: "0",
      TRIPLETEX_LEADERBOARD_POLL_INTERVAL_MS: "0",
      TRIPLETEX_LEADERBOARD_POLL_WINDOW_MS: "1000",
      TRIPLETEX_STORAGE_MODE: "testing",
    },
    now: () => new Date("2026-03-20T23:30:00.000Z"),
    sandboxEnvPath: path.join(tempRoot, ".sandbox.env"),
    tmuxLeaderboardFetch: async () => {
      leaderboardFetchCount += 1;
      return new Response(
        JSON.stringify([
          {
            tx_task_id: "08",
            best_score: leaderboardFetchCount === 1 ? 0.8 : 0.9,
            total_attempts: leaderboardFetchCount === 1 ? 3 : 4,
            rolling_scores: [0.9],
            last_attempt_at:
              leaderboardFetchCount === 1
                ? "2026-03-20T23:29:00.000Z"
                : "2026-03-20T23:30:10.000Z",
          },
        ]),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      );
    },
    tmuxRunCommand: async (cmd) => {
      tmuxCommands.push([...cmd]);
      if (cmd[1] === "new-window") {
        const launchScriptPath = cmd[cmd.length - 1]!;
        const runDir = path.dirname(launchScriptPath);
        const stagedPrompt = (await readFile(
          path.join(runDir, "codex-prompt.txt"),
          "utf8",
        )).trimEnd();
        const sessionsDir = path.join(
          codexHomeDir,
          "sessions",
          "2026",
          "03",
          "20",
        );
        await mkdir(sessionsDir, { recursive: true });
        await writeFile(
          path.join(sessionsDir, "session.jsonl"),
          [
            JSON.stringify({
              type: "session_meta",
              payload: {
                id: "session-123",
                timestamp: "2026-03-20T23:30:00.000Z",
                cwd: codexEnvironmentDir,
              },
            }),
            JSON.stringify({
              type: "event_msg",
              timestamp: "2026-03-20T23:30:00.100Z",
              payload: {
                type: "user_message",
                message: stagedPrompt,
              },
            }),
            JSON.stringify({
              type: "event_msg",
              timestamp: "2026-03-20T23:30:01.000Z",
              payload: {
                type: "task_complete",
              },
            }),
            "",
          ].join("\n"),
          "utf8",
        );
      }
      return "";
    },
    tmuxSessionExists: async () => false,
    logger() {
      // Silence test logs.
    },
  });
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });
  await writeFile(
    path.join(tempRoot, ".sandbox.env"),
    [
      "TRIPLETEX_TEST_BASE_URL=https://sandbox-file.invalid/v2",
      "TRIPLETEX_TEST_SESSION_TOKEN=sandbox-session-token",
      "",
    ].join("\n"),
  );

  const response = await handler(
    createSolveRequest({
      authorization: "Bearer secret-token",
      requestId: "req-http-tmux",
      files: [
        {
          filename: "note.txt",
          content_base64: Buffer.from("hello tripletex\n").toString("base64"),
          mime_type: "text/plain",
        },
      ],
      tripletexCredentials: {
        base_url: "replace-me",
        session_token: "replace-me",
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "completed" });
  assert.equal(response.headers.get("x-request-id"), "req-http-tmux");
  assert.equal(response.headers.get("x-tripletex2-run-id"), "test-http-tmux");
  assert.equal(response.headers.get("x-tripletex2-runtime-status"), "completed");

  const runDir = path.join(dataRoot, "testing", "runs", "test-http-tmux");
  await stat(path.join(runDir, "request.json"));
  await stat(path.join(runDir, "manifest.json"));
  await stat(path.join(runDir, "result.json"));
  await stat(path.join(runDir, "leaderboard.before.json"));
  await stat(path.join(runDir, "attachments", "01-note.txt"));
  await stat(path.join(runDir, "scripts"));

  const resultJson = JSON.parse(
    await readFile(path.join(runDir, "result.json"), "utf8"),
  ) as {
    matchedSession?: { sessionId?: string };
    runtimeStatus: string;
  };
  assert.equal(resultJson.runtimeStatus, "completed");
  assert.equal(resultJson.matchedSession?.sessionId, "session-123");

  const taskAttribution = await waitForJsonFile(path.join(runDir, "task-attribution.json"));
  assert.equal(taskAttribution.inference_status, "unique_attempt_delta");
  assert.equal(taskAttribution.tx_task_id, "08");

  assert.equal(tmuxCommands.some((cmd) => cmd[1] === "new-session"), true);
  assert.equal(tmuxCommands.some((cmd) => cmd[1] === "new-window"), true);
  },
);

test(
  "POST /solve in competition mode stages the tmux run under production storage by default",
  { concurrency: false },
  async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "tripletex2-server-"));
  const dataRoot = path.join(tempRoot, "data");
  const codexHomeDir = path.join(tempRoot, ".codex");
  const codexEnvironmentDir = "/repo/tasks/tripletex2/codex-environment";
  const handler = createSolveRequestHandler({
    bearerToken: "secret-token",
    mode: "competition",
    codexEnvironmentDir,
    codexHomeDir,
    createRunId: () => "competition-http-tmux",
    dataRoot,
    env: {
      CODEX_HOME: codexHomeDir,
      HOME: tempRoot,
      TRIPLETEX_STORAGE_MODE: "production",
    },
    now: () => new Date("2026-03-20T23:35:00.000Z"),
    tmuxRunCommand: async (cmd) => {
      if (cmd[1] === "new-window") {
        const launchScriptPath = cmd[cmd.length - 1]!;
        const runDir = path.dirname(launchScriptPath);
        const stagedPrompt = await readFile(
          path.join(runDir, "codex-prompt.txt"),
          "utf8",
        );
        const sessionsDir = path.join(
          codexHomeDir,
          "sessions",
          "2026",
          "03",
          "20",
        );
        await mkdir(sessionsDir, { recursive: true });
        await writeFile(
          path.join(sessionsDir, "session.jsonl"),
          [
            JSON.stringify({
              type: "session_meta",
              payload: {
                id: "session-competition-1",
                timestamp: "2026-03-20T23:35:00.000Z",
                cwd: codexEnvironmentDir,
              },
            }),
            JSON.stringify({
              type: "event_msg",
              timestamp: "2026-03-20T23:35:00.100Z",
              payload: {
                type: "user_message",
                message: stagedPrompt,
              },
            }),
            JSON.stringify({
              type: "event_msg",
              timestamp: "2026-03-20T23:35:01.000Z",
              payload: {
                type: "task_complete",
              },
            }),
            "",
          ].join("\n"),
          "utf8",
        );
      }
      return "";
    },
    tmuxSessionExists: async () => false,
    logger() {
      // Silence test logs.
    },
  });
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const response = await handler(
    createSolveRequest({
      authorization: "Bearer secret-token",
      requestId: "req-http-competition",
      tripletexCredentials: {
        base_url: "https://api.example.invalid/v2",
        session_token: "live-session-token",
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-tripletex2-run-id"), "competition-http-tmux");
  assert.equal(response.headers.get("x-tripletex2-runtime-status"), "completed");

  const runDir = path.join(dataRoot, "production", "runs", "competition-http-tmux");
  await stat(path.join(runDir, "request.json"));
  await stat(path.join(runDir, "manifest.json"));
  await stat(path.join(runDir, "result.json"));
  await stat(path.join(runDir, "scripts"));

  const manifest = JSON.parse(
    await readFile(path.join(runDir, "manifest.json"), "utf8"),
  ) as {
    request_id: string;
    run_dir: string;
    storage_mode: string;
  };
  assert.equal(manifest.request_id, "req-http-competition");
  assert.equal(manifest.run_dir, runDir);
  assert.equal(manifest.storage_mode, "production");
  },
);

function createSolveRequest(input: {
  authorization: string;
  requestId?: string;
  files?: Array<{
    filename: string;
    content_base64: string;
    mime_type?: string;
  }>;
  tripletexCredentials?: {
    base_url?: string;
    session_token?: string;
    credential_source?: string;
  };
}): Request {
  return new Request("http://tripletex2.test/solve", {
    method: "POST",
    headers: {
      authorization: input.authorization,
      "content-type": "application/json",
      ...(input.requestId ? { "x-request-id": input.requestId } : {}),
    },
    body: JSON.stringify({
      prompt:
        "Opprett og send en faktura til kunden Nordhav AS (org.nr 876520427) på 7850 kr eksklusiv MVA. Fakturaen gjelder Analyserapport.",
      files: input.files ?? [],
      tripletex_credentials:
        input.tripletexCredentials ?? {
          base_url: "https://example.invalid",
          session_token: "redacted-for-test",
          credential_source: "fixture",
        },
    }),
  });
}

function createFixtureTripletexFetch(): TripletexFetch {
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

    throw new Error(`Unexpected Tripletex fixture request: ${init.method} ${url.pathname}`);
  };
}

async function waitForJsonFile(filePath: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      return JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw new Error(`Timed out waiting for ${filePath}`);
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
