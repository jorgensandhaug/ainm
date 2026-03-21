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
import { registerPendingCodexTaskUnderstandingResult } from "./runtime/codex-task-understanding-callback";
import { taskRegistrations } from "./registry/tasks";
import { createSolveRequestHandler } from "./server";

test("POST /solve writes staging plus a canonical success artifact and respects caller run identity", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "tripletex2-server-"));
  const handler = createSolveRequestHandler({
    bearerToken: "secret-token",
    mode: "sandbox",
    solveBackend: "deterministic",
    selectionConfigOverride: await createSelectionConfigOverride(),
    now: () => new Date("2026-03-20T23:00:00.000Z"),
    createRunId: () => "sandbox-http-success",
    dataRoot: path.join(tempRoot, "data"),
    artifactRoot: path.join(tempRoot, "runs"),
    promptCorpusPath: path.join(tempRoot, "data", "prompt-corpus.jsonl"),
    env: { TRIPLETEX_STORAGE_MODE: "sandbox" },
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
    promptCorpusPath: path.join(tempRoot, "data", "prompt-corpus.jsonl"),
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

test("POST /internal/classify-result resolves a pending classifier callback", async (t) => {
  const handler = createSolveRequestHandler({
    logger() {
      // Silence test logs.
    },
  });
  const registration = registerPendingCodexTaskUnderstandingResult(
    "req-internal-classify-1",
  );
  t.after(() => {
    registration.cleanup();
  });

  const payload = JSON.stringify({
    status: "resolved",
    taskId: "08",
    inputJson: JSON.stringify({
      customerName: "Nordhav AS",
      organizationNumber: "876520427",
      lineDescription: "Analyserapport",
      quantity: 1,
      unitPriceExcludingVatNok: 7850,
    }),
    code: null,
    message: null,
    partialInputJson: null,
    notes: ["Matched task 08."],
  });

  const response = await handler(
    new Request(
      "http://localhost/internal/classify-result?requestId=req-internal-classify-1",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: payload,
      },
    ),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "accepted" });
  assert.equal(await registration.promise, payload);
});

test("POST /solve enforces the concurrency limit", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "tripletex2-server-"));
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });
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
    promptCorpusPath: path.join(tempRoot, "data", "prompt-corpus.jsonl"),
    selectionConfigOverride: await createSelectionConfigOverride(),
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
    selectionConfigOverride: await createSelectionConfigOverride(),
    sandboxEnvPath,
    now: () => new Date("2026-03-20T23:20:00.000Z"),
    createRunId: () => "sandbox-http-fallback",
    dataRoot: path.join(tempRoot, "data"),
    artifactRoot: path.join(tempRoot, "runs"),
    promptCorpusPath: path.join(tempRoot, "data", "prompt-corpus.jsonl"),
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
  "POST /solve appends prompt corpus before tmux fallback when the classified task is placeholder-pinned",
  { concurrency: false },
  async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "tripletex2-server-"));
  const dataRoot = path.join(tempRoot, "data");
  const promptCorpusPath = path.join(tempRoot, "data", "prompt-corpus.jsonl");
  const codexHomeDir = path.join(tempRoot, ".codex");
  const codexEnvironmentDir = "/repo/tasks/tripletex2/codex-environment";
  const handler = createSolveRequestHandler({
    bearerToken: "secret-token",
    mode: "sandbox",
    solveBackend: "deterministic",
    codexEnvironmentDir,
    codexHomeDir,
    createRunId: () => "sandbox-http-placeholder-fallback",
    dataRoot,
    promptCorpusPath,
    env: {
      CODEX_HOME: codexHomeDir,
      HOME: tempRoot,
      TRIPLETEX_LEADERBOARD_DELAY_MS: "0",
      TRIPLETEX_LEADERBOARD_POLL_INTERVAL_MS: "0",
      TRIPLETEX_LEADERBOARD_POLL_WINDOW_MS: "1000",
      TRIPLETEX_STORAGE_MODE: "testing",
    },
    selectionConfigOverride: await createSelectionConfigOverride(),
    taskUnderstanding: {
      result: {
        status: "resolved",
        taskId: "23",
        input: {},
      } satisfies TaskUnderstandingResolved<Record<string, unknown>, string>,
      taskSource: "manual-label",
      inputSource: "fixture",
    },
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
          "21",
        );
        await mkdir(sessionsDir, { recursive: true });
        await writeFile(
          path.join(sessionsDir, "session.jsonl"),
          [
            JSON.stringify({
              type: "session_meta",
              payload: {
                id: "session-placeholder-fallback-1",
                timestamp: "2026-03-21T13:00:00.000Z",
                cwd: codexEnvironmentDir,
              },
            }),
            JSON.stringify({
              type: "event_msg",
              timestamp: "2026-03-21T13:00:00.100Z",
              payload: {
                type: "user_message",
                message: stagedPrompt,
              },
            }),
            JSON.stringify({
              type: "event_msg",
              timestamp: "2026-03-21T13:00:01.000Z",
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
    tmuxLeaderboardFetch: async () =>
      new Response("[]\n", {
        headers: {
          "content-type": "application/json",
        },
        status: 200,
      }),
    now: () => new Date("2026-03-21T13:00:00.000Z"),
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
      requestId: "req-http-placeholder-fallback",
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "completed" });
  assert.deepEqual(
    JSON.parse(await readFile(promptCorpusPath, "utf8").then((value) => value.trim())),
    {
      taskId: "23",
      txTaskId: "23",
      status: "resolved",
      prompt:
        "Opprett og send en faktura til kunden Nordhav AS (org.nr 876520427) på 7850 kr eksklusiv MVA. Fakturaen gjelder Analyserapport.",
      files: [],
      runId: "sandbox-http-placeholder-fallback",
      timestamp: "2026-03-21T13:00:00.000Z",
      source: "testing",
    },
  );
  await stat(path.join(dataRoot, "testing", "runs", "sandbox-http-placeholder-fallback", "result.json"));
  },
);

test(
  "POST /solve in deterministic mode executes task 21 directly when the pinned strategy is implemented",
  { concurrency: false },
  async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "tripletex2-server-"));
  const dataRoot = path.join(tempRoot, "data");
  const codexHomeDir = path.join(tempRoot, ".codex");
  const codexEnvironmentDir = "/repo/tasks/tripletex2/codex-environment";
  const tmuxCommands: string[][] = [];
  const handler = createSolveRequestHandler({
    bearerToken: "secret-token",
    mode: "sandbox",
    solveBackend: "deterministic",
    codexEnvironmentDir,
    codexHomeDir,
    createRunId: () => "sandbox-http-tier3-fallback",
    dataRoot,
    artifactRoot: path.join(tempRoot, "runs"),
    promptCorpusPath: path.join(tempRoot, "data", "prompt-corpus.jsonl"),
    env: {
      CODEX_HOME: codexHomeDir,
      HOME: tempRoot,
      TRIPLETEX_LEADERBOARD_DELAY_MS: "0",
      TRIPLETEX_LEADERBOARD_POLL_INTERVAL_MS: "0",
      TRIPLETEX_LEADERBOARD_POLL_WINDOW_MS: "1000",
      TRIPLETEX_STORAGE_MODE: "sandbox",
    },
    now: () => new Date("2026-03-21T12:00:00.000Z"),
    selectionConfigOverride: await createSelectionConfigOverride(),
    taskUnderstanding: {
      result: {
        status: "resolved",
        taskId: "21",
        input: {},
      } satisfies TaskUnderstandingResolved<Record<string, unknown>, string>,
      taskSource: "manual-label",
      inputSource: "fixture",
    },
    fetch: createTask21FixtureTripletexFetch(),
    tmuxRunCommand: async (cmd) => {
      tmuxCommands.push([...cmd]);
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
          "21",
        );
        await mkdir(sessionsDir, { recursive: true });
        await writeFile(
          path.join(sessionsDir, "session.jsonl"),
          [
            JSON.stringify({
              type: "session_meta",
              payload: {
                id: "session-tier3-1",
                timestamp: "2026-03-21T12:00:00.000Z",
                cwd: codexEnvironmentDir,
              },
            }),
            JSON.stringify({
              type: "event_msg",
              timestamp: "2026-03-21T12:00:00.100Z",
              payload: {
                type: "user_message",
                message: stagedPrompt,
              },
            }),
            JSON.stringify({
              type: "event_msg",
              timestamp: "2026-03-21T12:00:01.000Z",
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
    tmuxLeaderboardFetch: async () =>
      new Response("[]\n", {
        headers: {
          "content-type": "application/json",
        },
        status: 200,
      }),
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
      requestId: "req-http-tier3-fallback",
      tripletexCredentials: {
        base_url: "https://api.example.invalid/v2",
        session_token: "session-token",
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("x-tripletex2-run-id"),
    "sandbox-http-tier3-fallback",
  );
  assert.equal(response.headers.get("x-tripletex2-runtime-status"), "completed");

  const runDir = path.join(
    dataRoot,
    "sandbox",
    "runs",
    "sandbox-http-tier3-fallback",
  );
  await stat(path.join(runDir, "request.json"));
  await stat(path.join(runDir, "result.json"));
  assert.equal(tmuxCommands.some((cmd) => cmd[1] === "new-window"), false);
  assert.equal(
    await exists(path.join(
      tempRoot,
      "runs",
      "2026-03-21",
      "run-sandbox-http-tier3-fallback.json",
    )),
    true,
  );
  },
);

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
    solveBackend: "tmux",
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
    solveBackend: "tmux",
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

async function createSelectionConfigOverride(): Promise<{
  schemaVersion: "tripletex2.active-strategy-selection.v1";
  selectionConfigId: string;
  taskStrategies: Record<string, string>;
}> {
  return {
    schemaVersion: "tripletex2.active-strategy-selection.v1",
    selectionConfigId: "active-strategies-test-selection",
    taskStrategies: Object.fromEntries(
      await Promise.all(
        taskRegistrations.map(async (registration) => {
          const taskModule = await registration.loadTaskModule();
          return [
            registration.task.taskId,
            taskModule.strategies[0]?.strategyId ??
              `${registration.task.taskId}.missing-strategy`,
          ];
        }),
      ),
    ),
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
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

function createTask21FixtureTripletexFetch(): TripletexFetch {
  let createdVoucherCount = 0;

  return async (input, init) => {
    const url = new URL(input);
    const pathname = url.pathname.replace(/^\/v2(?=\/|$)/, "") || "/";

    if (init.method === "GET" && pathname === "/ledger/voucher") {
      return createResponse(200, {
        values: [
          {
            id: 101,
            number: 1101,
            date: "2026-01-12",
            description: "Telefonkostnad feil konto",
            postings: [
              {
                account: { id: 710001, number: 7100 },
                amount: 2250,
                amountCurrency: 2250,
                amountGross: 2250,
                amountGrossCurrency: 2250,
              },
              {
                account: { id: 192001, number: 1920 },
                amount: -2250,
                amountCurrency: -2250,
                amountGross: -2250,
                amountGrossCurrency: -2250,
              },
            ],
          },
          {
            id: 201,
            number: 1201,
            date: "2026-01-20",
            description: "Kontorrekvisita",
            postings: [
              {
                account: { id: 650001, number: 6500 },
                amount: 1500,
                amountCurrency: 1500,
                amountGross: 1500,
                amountGrossCurrency: 1500,
              },
              {
                account: { id: 240001, number: 2400 },
                amount: -1500,
                amountCurrency: -1500,
                amountGross: -1500,
                amountGrossCurrency: -1500,
              },
            ],
          },
          {
            id: 202,
            number: 1202,
            date: "2026-01-20",
            description: "Kontorrekvisita",
            postings: [
              {
                account: { id: 650001, number: 6500 },
                amount: 1500,
                amountCurrency: 1500,
                amountGross: 1500,
                amountGrossCurrency: 1500,
              },
              {
                account: { id: 240001, number: 2400 },
                amount: -1500,
                amountCurrency: -1500,
                amountGross: -1500,
                amountGrossCurrency: -1500,
              },
            ],
          },
          {
            id: 301,
            number: 1301,
            date: "2026-02-03",
            description: "Programvarelisens",
            postings: [
              {
                account: { id: 654001, number: 6540 },
                amount: 22000,
                amountCurrency: 22000,
                amountGross: 22000,
                amountGrossCurrency: 22000,
              },
              {
                account: { id: 240002, number: 2400 },
                supplier: { id: 88 },
                currency: { id: 1 },
                invoiceNumber: "LEV-8841",
                amount: -22000,
                amountCurrency: -22000,
                amountGross: -22000,
                amountGrossCurrency: -22000,
              },
            ],
          },
          {
            id: 401,
            number: 1401,
            date: "2026-02-17",
            description: "Kursavgift",
            postings: [
              {
                account: { id: 686001, number: 6860 },
                amount: 8650,
                amountCurrency: 8650,
                amountGross: 8650,
                amountGrossCurrency: 8650,
              },
              {
                account: { id: 240003, number: 2400 },
                supplier: { id: 99 },
                currency: { id: 1 },
                invoiceNumber: "KURS-2026-09",
                amount: -8650,
                amountCurrency: -8650,
                amountGross: -8650,
                amountGrossCurrency: -8650,
              },
            ],
          },
        ],
      });
    }

    if (init.method === "GET" && pathname === "/ledger/account") {
      return createResponse(200, {
        values: [
          { id: 271001, number: 2710 },
          { id: 714001, number: 7140 },
        ],
      });
    }

    if (init.method === "POST" && pathname === "/ledger/voucher") {
      createdVoucherCount += 1;
      return createResponse(200, {
        value: {
          id: 9000 + createdVoucherCount,
        },
      });
    }

    if (init.method === "PUT" && pathname === "/ledger/voucher/202/:reverse") {
      return createResponse(200, {
        value: {
          id: 9002,
        },
      });
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
