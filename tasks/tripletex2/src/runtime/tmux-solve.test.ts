import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "bun:test";

import {
  buildCodexPrompt,
  buildLaunchScript,
  prepareRun,
  type PreparedTmuxRun,
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
      "Knowledge order:",
      "- 1. ./docs/trusted-standards/",
      "- 2. ./docs/task-playbooks/",
      "- 3. ../tripletex/codex-environment/openapi.json",
      "- If this is an exact trusted-standard match, use it directly and do not re-check ../tripletex/codex-environment/openapi.json.",
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

test("buildLaunchScript runs codex from the tripletex2 root and drops into interactive zsh", () => {
  const preparedRun = createPreparedRun({
    launchScriptPath: "/tmp/run/launch-codex.zsh",
    promptFilePath: "/tmp/run/codex-prompt.txt",
    requestFilePath: "/tmp/run/request.json",
    runDir: "/tmp/run",
    runId: "test-run",
  });

  assert.equal(
    buildLaunchScript(preparedRun, {
      codexEnvironmentDir: "/repo/tasks/tripletex2",
    }),
    `#!/usr/bin/env zsh
set -u

cd '/repo/tasks/tripletex2'

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
        codexEnvironmentDir: "/repo/tasks/tripletex2",
        codexHomeDir: path.join(tempRoot, ".codex"),
        createRunId: () => "test-fixed-run",
        dataRoot: path.join(tempRoot, "data"),
        env: {
          TRIPLETEX_STORAGE_MODE: "testing",
        },
        now: () => new Date("2026-03-20T23:40:00.000Z"),
        sandboxEnvPath,
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
      attachments: Array<{ path: string }>;
      codex_environment_dir: string;
      codex_home_dir: string;
      credentials_source: string;
      effective_base_url: string;
      storage_mode: string;
    };
    assert.equal(manifest.storage_mode, "testing");
    assert.equal(manifest.credentials_source, "sandbox");
    assert.equal(manifest.effective_base_url, "https://sandbox-file.invalid/v2");
    assert.equal(manifest.codex_environment_dir, "/repo/tasks/tripletex2");
    assert.equal(manifest.codex_home_dir, path.join(tempRoot, ".codex"));
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
