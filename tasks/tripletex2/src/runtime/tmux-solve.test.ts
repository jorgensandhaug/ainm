import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "bun:test";

import {
  attributeRunToLeaderboardTask,
  buildCodexPrompt,
  buildLaunchScript,
  continuePostRunProcessing,
  diffLeaderboardSnapshots,
  fetchSubmissions,
  type LeaderboardSnapshot,
  inferTaskAttribution,
  inferSubmissionMatch,
  pollAndMatchSubmission,
  prepareRun,
  type PreparedTmuxRun,
  runTmuxSolvePipeline,
  type SubmissionEntry,
  type SubmissionSnapshot,
} from "./tmux-solve";

test("buildCodexPrompt matches the staged tmux prompt format", () => {
  const prompt = buildCodexPrompt(
    {
      prompt: "Opprett kunde Nordhav AS.",
      files: [],
      tripletex_credentials: {},
    },
    [
      {
        fileName: "note.txt",
        contentBase64: Buffer.from("hello tripletex\n").toString("base64"),
        mediaType: "text/plain",
        path: "/tmp/run/attachments/01-note.txt",
        textContent: "hello tripletex\n",
      },
    ],
    {
      baseUrl: "https://sandbox.example.invalid/v2",
      sessionToken: "sandbox-session-token",
      source: "sandbox",
    },
    "/tmp/run/scripts",
  );

  assert.equal(
    prompt,
    [
      "Scored Tripletex run.",
      "Follow ./AGENTS.md exactly.",
      "",
      "Highest priorities:",
      "- Get the final Tripletex state exactly correct.",
      "- Use the fewest API calls possible.",
      "- Avoid all avoidable 4xx errors.",
      "",
      "Run-specific rules:",
      "- Only interact with the Tripletex API by writing TypeScript and running it with bun.",
      "- Put all API-interaction scripts only in this run scripts directory: /tmp/run/scripts",
      "- Do not place API-interaction scripts anywhere else.",
      "- Reuse POST/PUT responses instead of doing follow-up GETs whenever possible.",
      "- Ideal read count is zero. If a read is required, prefer one decisive GET with fields=*.",
      "- Use only the provided base URL and session token.",
      "- Authenticate with Basic Auth username 0 and password = session token.",
      "- If the provided base URL already includes /v2, do not build URLs in a way that escapes back to the host root.",
      "- If credentials are obviously fake, or the first attempted call returns invalid/expired token, treat the run as blocked instead of guessing.",
      "- Do not ask questions. Do not talk to the user. Do only the task.",
      "",
      "Task:",
      "Opprett kunde Nordhav AS.",
      "",
      "Tripletex API base URL:",
      "https://sandbox.example.invalid/v2",
      "",
      "Tripletex session token:",
      "sandbox-session-token",
      "",
      "Run scripts directory:",
      "/tmp/run/scripts",
      "",
      "Attachment paths:",
      "/tmp/run/attachments/01-note.txt",
    ].join("\n"),
  );
});

test("buildLaunchScript runs codex from the codex-environment directory and drops into interactive zsh", () => {
  const preparedRun = createPreparedRun({
    launchScriptPath: "/tmp/run/launch-codex.zsh",
    promptFilePath: "/tmp/run/codex-prompt.txt",
    requestFilePath: "/tmp/run/request.json",
    runDir: "/tmp/run",
    runId: "test-run",
  });

  assert.equal(
    buildLaunchScript(preparedRun, {
      codexEnvironmentDir: "/repo/tasks/tripletex2/codex-environment",
    }),
    `#!/usr/bin/env zsh
set -u

cd '/repo/tasks/tripletex2/codex-environment'

PROMPT_FILE='/tmp/run/codex-prompt.txt'

codex -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex exited with status $status"
print "run id: test-run"
print "run dir: /tmp/run"
print "request file: /tmp/run/request.json"
exec zsh -i
`,
  );
});

test("prepareRun stages the run directory, attachments, manifest, prompt, and launch script", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "tripletex2-tmux-run-"));
  const sandboxEnvPath = path.join(tempRoot, ".sandbox.env");
  try {
    await writeFile(
      sandboxEnvPath,
      [
        "TRIPLETEX_TEST_BASE_URL=https://sandbox-file.invalid/v2",
        "TRIPLETEX_TEST_SESSION_TOKEN=sandbox-file-token",
        "TRIPLETEX_SUBMISSIONS_ACCESS_TOKEN=submissions-token",
        "",
      ].join("\n"),
    );

    const preparedRun = await prepareRun(
      {
        prompt: "Opprett kunde Nordhav AS.",
        files: [
          {
            fileName: "note.txt",
            contentBase64: Buffer.from("hello tripletex\n").toString("base64"),
            mediaType: "text/plain",
            textContent: "hello tripletex\n",
          },
        ],
        tripletex_credentials: {
          base_url: "replace-me",
          session_token: "replace-me",
          credential_source: "fixture",
        },
      },
      "req-stage-1",
      {
        codexEnvironmentDir: "/repo/tasks/tripletex2/codex-environment",
        codexHomeDir: path.join(tempRoot, ".codex"),
        createRunId: () => "test-fixed-run",
        dataRoot: path.join(tempRoot, "data"),
        env: {
          TRIPLETEX_STORAGE_MODE: "testing",
        },
        leaderboardFetch: async () =>
          new Response(
            JSON.stringify([
              {
                tx_task_id: "08",
                best_score: 0.8,
                total_attempts: 3,
                rolling_scores: [0.8],
                last_attempt_at: "2026-03-20T23:39:00.000Z",
              },
            ]),
            {
              headers: {
                "content-type": "application/json",
              },
              status: 200,
            },
          ),
        now: () => new Date("2026-03-20T23:40:00.000Z"),
        sandboxEnvPath,
        submissionsFetch: async () =>
          new Response(
            JSON.stringify([
              {
                completed_at: null,
                duration_ms: null,
                id: "sub-1",
                normalized_score: null,
                queued_at: "2026-03-20T23:39:30.000Z",
                score_max: null,
                score_raw: null,
                status: "processing",
              },
            ]),
            {
              headers: {
                "content-type": "application/json",
              },
              status: 200,
            },
          ),
      },
    );

    assert.equal(preparedRun.runId, "test-fixed-run");
    assert.equal(
      preparedRun.runDir,
      path.join(tempRoot, "data", "testing", "runs", "test-fixed-run"),
    );

    const attachmentPath = path.join(
      preparedRun.runDir,
      "attachments",
      "01-note.txt",
    );
    const manifestPath = path.join(preparedRun.runDir, "manifest.json");
    const requestPath = path.join(preparedRun.runDir, "request.json");
    const promptPath = path.join(preparedRun.runDir, "codex-prompt.txt");
    const launchScriptPath = path.join(preparedRun.runDir, "launch-codex.zsh");

    await stat(attachmentPath);
    await stat(path.join(preparedRun.runDir, "scripts"));
    await stat(manifestPath);
    await stat(requestPath);
    await stat(promptPath);
    await stat(path.join(preparedRun.runDir, "leaderboard.before.json"));
    await stat(path.join(preparedRun.runDir, "submissions.before.json"));
    const launchScriptStat = await stat(launchScriptPath);
    assert.notEqual(launchScriptStat.mode & 0o111, 0);

    assert.equal(await readFile(attachmentPath, "utf8"), "hello tripletex\n");

    const requestJson = JSON.parse(await readFile(requestPath, "utf8")) as {
      files: Array<{ filename: string }>;
      tripletex_credentials: { base_url: string; session_token: string };
    };
    assert.equal(requestJson.files[0]?.filename, "note.txt");
    assert.equal(requestJson.tripletex_credentials.base_url, "replace-me");
    assert.equal(requestJson.tripletex_credentials.session_token, "replace-me");

    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      attachments: Array<{ filename: string; mime_type?: string; path: string }>;
      credentials_source: string;
      effective_base_url: string;
      leaderboard_before_captured: boolean;
      request_id: string;
      run_dir: string;
      run_id: string;
      scripts_dir: string;
      storage_mode: string;
      submissions_before_captured: boolean;
      tmux_session: string;
      tmux_window: string;
    };
    assert.equal(manifest.request_id, "req-stage-1");
    assert.equal(manifest.run_id, "test-fixed-run");
    assert.equal(manifest.run_dir, preparedRun.runDir);
    assert.equal(manifest.storage_mode, "testing");
    assert.equal(manifest.tmux_session, "ainm-tripletex-sessions");
    assert.equal(manifest.tmux_window, "test-fixed-run");
    assert.equal(manifest.scripts_dir, path.join(preparedRun.runDir, "scripts"));
    assert.equal(manifest.credentials_source, "sandbox");
    assert.equal(manifest.effective_base_url, "https://sandbox-file.invalid/v2");
    assert.equal(manifest.leaderboard_before_captured, true);
    assert.equal(manifest.submissions_before_captured, true);
    assert.equal(manifest.attachments[0]?.filename, "note.txt");
    assert.equal(manifest.attachments[0]?.mime_type, "text/plain");
    assert.equal(manifest.attachments[0]?.path, attachmentPath);

    const promptText = await readFile(promptPath, "utf8");
    assert.equal(promptText.includes("https://sandbox-file.invalid/v2"), true);
    assert.equal(promptText.includes("sandbox-file-token"), true);
    assert.equal(promptText.includes(attachmentPath), true);

    const launchScript = await readFile(launchScriptPath, "utf8");
    assert.equal(launchScript.includes("codex -m gpt-5.4"), true);
    assert.equal(launchScript.includes("exec zsh -i"), true);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("fetchSubmissions uses access token cookie auth and configured URL", async () => {
  let observedCookie: string | undefined;
  let observedUrl: string | undefined;

  const snapshot = await fetchSubmissions(createPreparedRun({}), "before", {
    env: {
      TRIPLETEX_MY_SUBMISSIONS_URL: "https://submissions.example.invalid/list",
      TRIPLETEX_SUBMISSIONS_ACCESS_TOKEN: "submission-token",
    },
    submissionsFetch: (async (input, init) => {
      observedUrl = String(input);
      observedCookie = String(init?.headers?.cookie);
      return new Response(
        JSON.stringify([
          createSubmissionEntry({
            id: "sub-1",
            queued_at: "2026-03-20T23:30:10.000Z",
            status: "queued",
          }),
        ]),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      );
    }) as typeof fetch,
  });

  assert.equal(observedUrl, "https://submissions.example.invalid/list");
  assert.equal(observedCookie, "access_token=submission-token");
  assert.equal(snapshot?.url, "https://submissions.example.invalid/list");
  assert.equal(snapshot?.entries[0]?.id, "sub-1");
});

test("inferSubmissionMatch only considers submissions queued inside the solve window", () => {
  const match = inferSubmissionMatch(
    [],
    [
      createSubmissionEntry({
        completed_at: "2026-03-20T23:26:00.000Z",
        id: "too-early",
        queued_at: "2026-03-20T23:24:59.000Z",
        score_max: 10,
        score_raw: 10,
        status: "completed",
      }),
      createSubmissionEntry({
        completed_at: "2026-03-20T23:31:00.000Z",
        id: "candidate",
        queued_at: "2026-03-20T23:25:00.000Z",
        score_max: 10,
        score_raw: 9,
        status: "completed",
      }),
      createSubmissionEntry({
        completed_at: "2026-03-20T23:39:00.000Z",
        id: "too-late",
        queued_at: "2026-03-20T23:38:01.000Z",
        score_max: 10,
        score_raw: 8,
        status: "completed",
      }),
    ],
    "2026-03-20T23:27:00.000Z",
    "2026-03-20T23:36:00.000Z",
    120_000,
  );

  assert.equal(match.inference_status, "new_submission_completed");
  assert.equal(match.submission?.id, "candidate");
});

test("prepareRun captures submissions.before.json when submissions auth is configured", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "tripletex2-tmux-run-before-"));
  const sandboxEnvPath = path.join(tempRoot, ".sandbox.env");
  try {
    await writeFile(
      sandboxEnvPath,
      [
        "TRIPLETEX_TEST_BASE_URL=https://sandbox-file.invalid/v2",
        "TRIPLETEX_TEST_SESSION_TOKEN=sandbox-file-token",
        "TRIPLETEX_SUBMISSIONS_ACCESS_TOKEN=submission-token",
        "",
      ].join("\n"),
    );

    const preparedRun = await prepareRun(
      {
        prompt: "Opprett kunde Nordhav AS.",
        files: [],
        tripletex_credentials: {
          base_url: "replace-me",
          session_token: "replace-me",
        },
      },
      "req-stage-before",
      {
        createRunId: () => "test-fixed-run-before",
        dataRoot: path.join(tempRoot, "data"),
        env: {
          TRIPLETEX_MY_SUBMISSIONS_URL: "https://submissions.example.invalid/list",
          TRIPLETEX_STORAGE_MODE: "testing",
        },
        sandboxEnvPath,
        submissionsFetch: (async () =>
          new Response(
            JSON.stringify([
              createSubmissionEntry({
                id: "sub-before",
                queued_at: "2026-03-20T23:39:30.000Z",
                status: "queued",
              }),
            ]),
            {
              headers: {
                "content-type": "application/json",
              },
              status: 200,
            },
          )) as typeof fetch,
      },
    );

    const beforeSnapshot = JSON.parse(
      await readFile(
        path.join(preparedRun.runDir, "submissions.before.json"),
        "utf8",
      ),
    ) as SubmissionSnapshot;

    assert.equal(beforeSnapshot.url, "https://submissions.example.invalid/list");
    assert.equal(beforeSnapshot.entries[0]?.id, "sub-before");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("runTmuxSolvePipeline writes submission snapshots and submission-score.json after completion", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "tripletex2-tmux-pipeline-"));
  const sandboxEnvPath = path.join(tempRoot, ".sandbox.env");
  const codexHomeDir = path.join(tempRoot, ".codex");
  const dataRoot = path.join(tempRoot, "data");
  const codexEnvironmentDir = "/repo/tasks/tripletex2/codex-environment";
  let submissionsFetchCount = 0;
  try {
    await writeFile(
      sandboxEnvPath,
      [
        "TRIPLETEX_TEST_BASE_URL=https://sandbox-file.invalid/v2",
        "TRIPLETEX_TEST_SESSION_TOKEN=sandbox-file-token",
        "TRIPLETEX_SUBMISSIONS_ACCESS_TOKEN=submission-token",
        "",
      ].join("\n"),
    );

    const result = await runTmuxSolvePipeline(
      {
        prompt: "Opprett kunde Nordhav AS.",
        files: [],
        tripletex_credentials: {
          base_url: "replace-me",
          session_token: "replace-me",
        },
      },
      "req-pipeline",
      {
        codexEnvironmentDir,
        codexHomeDir,
        createRunId: () => "test-run-pipeline",
        dataRoot,
        env: {
          TRIPLETEX_LEADERBOARD_DELAY_MS: "0",
          TRIPLETEX_LEADERBOARD_POLL_INTERVAL_MS: "0",
          TRIPLETEX_LEADERBOARD_POLL_WINDOW_MS: "5",
          TRIPLETEX_LEADERBOARD_URL: "https://leaderboard.example.invalid/list",
          TRIPLETEX_MY_SUBMISSIONS_URL: "https://submissions.example.invalid/list",
          TRIPLETEX_STORAGE_MODE: "testing",
          TRIPLETEX_SUBMISSIONS_POLL_INTERVAL_MS: "0",
          TRIPLETEX_SUBMISSIONS_POLL_WINDOW_MS: "5",
        },
        now: () => new Date("2026-03-20T23:30:00.000Z"),
        leaderboardFetch: (async () =>
          new Response(JSON.stringify([]), {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          })) as typeof fetch,
        runCommand: async (cmd) => {
          if (cmd[0] === "tmux" && cmd[1] === "new-window") {
            const sessionPath = path.join(
              codexHomeDir,
              "sessions",
              "2026",
              "03",
              "20",
              "session-123.jsonl",
            );
            await mkdir(path.dirname(sessionPath), { recursive: true });
            const prompt = await readFile(
              path.join(
                dataRoot,
                "testing",
                "runs",
                "test-run-pipeline",
                "codex-prompt.txt",
              ),
              "utf8",
            );
            await writeFile(
              sessionPath,
              [
                JSON.stringify({
                  type: "session_meta",
                  payload: {
                    cwd: codexEnvironmentDir,
                    id: "session-123",
                    timestamp: "2026-03-20T23:30:01.000Z",
                  },
                }),
                JSON.stringify({
                  timestamp: "2026-03-20T23:30:01.100Z",
                  type: "event_msg",
                  payload: {
                    message: prompt.trimEnd(),
                    type: "user_message",
                  },
                }),
                JSON.stringify({
                  payload: {
                    type: "task_complete",
                  },
                  timestamp: "2026-03-20T23:31:00.000Z",
                  type: "event_msg",
                }),
                "",
              ].join("\n"),
            );
          }
          return "";
        },
        sandboxEnvPath,
        sleep: async () => {},
        submissionsFetch: (async () => {
          submissionsFetchCount += 1;
          return new Response(
            JSON.stringify([
              createSubmissionEntry({
                completed_at:
                  submissionsFetchCount === 1
                    ? null
                    : "2026-03-20T23:31:20.000Z",
                feedback:
                  submissionsFetchCount === 1
                    ? undefined
                    : {
                        checks: ["Check 1 passed", "Check 2 passed"],
                        comment: "Solid answer.",
                      },
                id: "sub-scored",
                normalized_score: submissionsFetchCount === 1 ? null : 0.8,
                queued_at: "2026-03-20T23:30:40.000Z",
                score_max: submissionsFetchCount === 1 ? null : 10,
                score_raw: submissionsFetchCount === 1 ? null : 8,
                status: submissionsFetchCount === 1 ? "processing" : "completed",
              }),
            ]),
            {
              headers: {
                "content-type": "application/json",
              },
              status: 200,
            },
          );
        }) as typeof fetch,
        tmuxSessionExists: async () => false,
      },
    );

    assert.equal(result.runtimeStatus, "completed");
    await continuePostRunProcessing(result, {
      dataRoot,
      env: {
        TRIPLETEX_LEADERBOARD_DELAY_MS: "0",
        TRIPLETEX_LEADERBOARD_POLL_INTERVAL_MS: "0",
        TRIPLETEX_LEADERBOARD_POLL_WINDOW_MS: "5",
        TRIPLETEX_LEADERBOARD_URL: "https://leaderboard.example.invalid/list",
        TRIPLETEX_MY_SUBMISSIONS_URL: "https://submissions.example.invalid/list",
        TRIPLETEX_STORAGE_MODE: "testing",
        TRIPLETEX_SUBMISSIONS_POLL_INTERVAL_MS: "0",
        TRIPLETEX_SUBMISSIONS_POLL_WINDOW_MS: "5",
      },
      leaderboardFetch: (async () =>
        new Response(JSON.stringify([]), {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        })) as typeof fetch,
      sandboxEnvPath,
      sleep: async () => {},
      submissionsFetch: (async () => {
        submissionsFetchCount += 1;
        return new Response(
          JSON.stringify([
            createSubmissionEntry({
              completed_at:
                submissionsFetchCount === 1
                  ? null
                  : "2026-03-20T23:31:20.000Z",
              feedback:
                submissionsFetchCount === 1
                  ? undefined
                  : {
                      checks: ["Check 1 passed", "Check 2 passed"],
                      comment: "Solid answer.",
                    },
              id: "sub-scored",
              normalized_score: submissionsFetchCount === 1 ? null : 0.8,
              queued_at: "2026-03-20T23:30:40.000Z",
              score_max: submissionsFetchCount === 1 ? null : 10,
              score_raw: submissionsFetchCount === 1 ? null : 8,
              status: submissionsFetchCount === 1 ? "processing" : "completed",
            }),
          ]),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        );
      }) as typeof fetch,
    });

    const runDir = path.join(dataRoot, "testing", "runs", "test-run-pipeline");
    const score = (await waitForJsonFile(
      path.join(runDir, "submission-score.json"),
    )) as {
      correctness?: number;
      status: string;
      submission_id?: string;
    };

    await stat(path.join(runDir, "submissions.before.json"));
    await stat(path.join(runDir, "submissions.after.json"));
    assert.equal(score.status, "completed");
    assert.equal(score.submission_id, "sub-scored");
    assert.equal(score.correctness, 0.8);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pollAndMatchSubmission skips when submissions auth is missing", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "tripletex2-tmux-skip-"));
  try {
    const preparedRun = createPreparedRun({
      requestId: "req-skip",
      runDir: tempRoot,
      runId: "skip-run",
    });

    await pollAndMatchSubmission(preparedRun, { reason: "timeout" });

    const score = JSON.parse(
      await readFile(path.join(tempRoot, "submission-score.json"), "utf8"),
    ) as {
      reason?: string;
      status: string;
    };

    assert.equal(score.status, "skipped");
    assert.equal(score.reason, "missing_submissions_access_token");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("runTmuxSolvePipeline kills the tmux window and writes timeout status when the deadline expires", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "tripletex2-tmux-timeout-"));
  const tmuxCommands: string[][] = [];
  try {
    const result = await runTmuxSolvePipeline(
      {
        prompt: "Opprett kunde Nordhav AS.",
        files: [],
        tripletex_credentials: {
          base_url: "https://api.example.invalid/v2",
          session_token: "session-token",
          credential_source: "fixture",
        },
      },
      "req-timeout-1",
      {
        codexEnvironmentDir: "/repo/tasks/tripletex2/codex-environment",
        createRunId: () => "test-timeout-run",
        dataRoot: path.join(tempRoot, "data"),
        env: {
          TRIPLETEX_STORAGE_MODE: "production",
        },
        now: () => new Date("2026-03-20T23:50:00.000Z"),
        runCommand: async (cmd) => {
          tmuxCommands.push([...cmd]);
          return "";
        },
        solveTimeoutMs: 0,
        tmuxSessionExists: async () => false,
      },
    );

    assert.equal(result.runtimeStatus, "timeout");

    const runDir = path.join(tempRoot, "data", "production", "runs", "test-timeout-run");
    const timeoutStatus = JSON.parse(
      await readFile(path.join(runDir, "timeout.status.json"), "utf8"),
    ) as {
      kill_window_succeeded: boolean;
      request_id: string;
      run_id: string;
      solve_timeout_ms: number;
      status: string;
      tmux_target: string;
    };
    const resultJson = JSON.parse(
      await readFile(path.join(runDir, "result.json"), "utf8"),
    ) as {
      runtimeStatus: string;
      waitReason: string;
    };

    assert.equal(timeoutStatus.status, "timeout");
    assert.equal(timeoutStatus.request_id, "req-timeout-1");
    assert.equal(timeoutStatus.run_id, "test-timeout-run");
    assert.equal(timeoutStatus.solve_timeout_ms, 0);
    assert.equal(timeoutStatus.tmux_target, "ainm-tripletex-sessions:test-timeout-run");
    assert.equal(timeoutStatus.kill_window_succeeded, true);
    assert.equal(resultJson.runtimeStatus, "timeout");
    assert.equal(resultJson.waitReason, "timeout");

    assert.equal(
      tmuxCommands.some(
        (cmd) =>
          cmd[0] === "tmux" &&
          cmd[1] === "kill-window" &&
          cmd[3] === "ainm-tripletex-sessions:test-timeout-run",
      ),
      true,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("diffLeaderboardSnapshots and inferTaskAttribution detect a unique attempt delta", () => {
  const beforeSnapshot: LeaderboardSnapshot = {
    captured_at: "2026-03-20T23:40:00.000Z",
    entries: [
      {
        tx_task_id: "08",
        best_score: 0.8,
        total_attempts: 3,
        rolling_scores: [0.8],
        last_attempt_at: "2026-03-20T23:39:00.000Z",
      },
      {
        tx_task_id: "09",
        best_score: 0.7,
        total_attempts: 1,
        rolling_scores: [0.7],
        last_attempt_at: "2026-03-20T23:20:00.000Z",
      },
    ],
    run_id: "run-1",
    source: "before",
    url: "https://example.invalid/leaderboard",
  };
  const afterSnapshot: LeaderboardSnapshot = {
    ...beforeSnapshot,
    captured_at: "2026-03-20T23:41:00.000Z",
    entries: [
      {
        tx_task_id: "08",
        best_score: 0.9,
        total_attempts: 4,
        rolling_scores: [0.9],
        last_attempt_at: "2026-03-20T23:40:30.000Z",
      },
      beforeSnapshot.entries[1]!,
    ],
    source: "after",
  };

  const diff = diffLeaderboardSnapshots(beforeSnapshot, afterSnapshot);
  assert.deepEqual(diff, [
    {
      attempt_delta: 1,
      best_score_after: 0.9,
      best_score_before: 0.8,
      last_attempt_after: "2026-03-20T23:40:30.000Z",
      last_attempt_before: "2026-03-20T23:39:00.000Z",
      total_attempts_after: 4,
      total_attempts_before: 3,
      tx_task_id: "08",
    },
  ]);
  assert.deepEqual(inferTaskAttribution(diff), {
    attempt_delta: 1,
    inference_status: "unique_attempt_delta",
    tx_task_id: "08",
  });
});

test("attributeRunToLeaderboardTask polls and writes attribution artifacts", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "tripletex2-lb-attrib-"));
  try {
    const runDir = path.join(tempRoot, "data", "testing", "runs", "test-run");
    await mkdir(runDir, { recursive: true });
    await writeFile(
      path.join(runDir, "leaderboard.before.json"),
      `${JSON.stringify(
        {
          captured_at: "2026-03-20T23:40:00.000Z",
          entries: [
            {
              tx_task_id: "08",
              best_score: 0.8,
              total_attempts: 3,
              rolling_scores: [0.8],
              last_attempt_at: "2026-03-20T23:39:00.000Z",
            },
          ],
          run_id: "test-run",
          source: "before",
          url: "https://example.invalid/leaderboard",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    let leaderboardFetchCount = 0;
    await attributeRunToLeaderboardTask(
      createPreparedRun({
        requestId: "req-lb-1",
        runDir,
        runId: "test-run",
      }),
      "completed",
      "2026-03-20T23:40:10.000Z",
      {
        dataRoot: path.join(tempRoot, "data"),
        env: {
          TRIPLETEX_LEADERBOARD_DELAY_MS: "0",
          TRIPLETEX_LEADERBOARD_POLL_INTERVAL_MS: "0",
          TRIPLETEX_LEADERBOARD_POLL_WINDOW_MS: "1000",
          TRIPLETEX_LEADERBOARD_URL: "https://example.invalid/leaderboard",
        },
        leaderboardFetch: async () => {
          leaderboardFetchCount += 1;
          const totalAttempts = leaderboardFetchCount === 1 ? 3 : 4;
          return new Response(
            JSON.stringify([
              {
                tx_task_id: "08",
                best_score: leaderboardFetchCount === 1 ? 0.8 : 0.9,
                total_attempts: totalAttempts,
                rolling_scores: [0.9],
                last_attempt_at:
                  leaderboardFetchCount === 1
                    ? "2026-03-20T23:39:00.000Z"
                    : "2026-03-20T23:40:20.000Z",
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
        sleep: async () => {},
      },
    );

    const afterSnapshot = JSON.parse(
      await readFile(path.join(runDir, "leaderboard.after.json"), "utf8"),
    ) as LeaderboardSnapshot;
    const diff = JSON.parse(
      await readFile(path.join(runDir, "leaderboard.diff.json"), "utf8"),
    ) as Array<{ attempt_delta: number; tx_task_id: string }>;
    const attribution = JSON.parse(
      await readFile(path.join(runDir, "task-attribution.json"), "utf8"),
    ) as {
      attempt_delta?: number;
      inference_status: string;
      tx_task_id?: string;
    };

    assert.equal(afterSnapshot.entries[0]?.total_attempts, 4);
    assert.deepEqual(diff, [
      {
        attempt_delta: 1,
        best_score_after: 0.9,
        best_score_before: 0.8,
        last_attempt_after: "2026-03-20T23:40:20.000Z",
        last_attempt_before: "2026-03-20T23:39:00.000Z",
        total_attempts_after: 4,
        total_attempts_before: 3,
        tx_task_id: "08",
      },
    ]);
    assert.equal(attribution.inference_status, "unique_attempt_delta");
    assert.equal(attribution.tx_task_id, "08");
    assert.equal(attribution.attempt_delta, 1);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

function createPreparedRun(
  overrides: Partial<PreparedTmuxRun>,
): PreparedTmuxRun {
  return {
    createdAt: "2026-03-20T23:30:00.000Z",
    codexPrompt: "Scored Tripletex run.",
    effectiveCredentials: {
      baseUrl: "https://example.invalid/v2",
      sessionToken: "session-token",
      source: "request",
    },
    files: [],
    launchScriptPath: "/tmp/run/launch-codex.zsh",
    promptFilePath: "/tmp/run/codex-prompt.txt",
    requestFilePath: "/tmp/run/request.json",
    requestId: "req-1",
    runDir: "/tmp/run",
    runId: "test-run",
    scriptsDir: "/tmp/run/scripts",
    solvePrompt: "Opprett kunde Nordhav AS.",
    storageMode: "production",
    tmuxSessionName: "ainm-tripletex-sessions",
    tmuxWindow: "test-run",
    ...overrides,
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

function createSubmissionEntry(
  overrides: Partial<SubmissionEntry> &
    Pick<SubmissionEntry, "id" | "queued_at" | "status">,
): SubmissionEntry {
  return {
    completed_at: null,
    duration_ms: null,
    id: overrides.id,
    normalized_score: null,
    queued_at: overrides.queued_at,
    score_max: null,
    score_raw: null,
    status: overrides.status,
    ...overrides,
  };
}
