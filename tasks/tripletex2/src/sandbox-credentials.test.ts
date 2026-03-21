import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  loadSandboxCredentials,
  loadSubmissionsAccessToken,
} from "./sandbox-credentials";

test("loadSandboxCredentials prefers env vars over .sandbox.env", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "tripletex2-sandbox-env-"));
  const sandboxEnvPath = path.join(tempRoot, ".sandbox.env");
  await writeFile(
    sandboxEnvPath,
    [
      "TRIPLETEX_TEST_BASE_URL=https://from-file.invalid/v2",
      "TRIPLETEX_TEST_SESSION_TOKEN=file-session-token",
      "",
    ].join("\n"),
  );
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const credentials = await loadSandboxCredentials({
    env: {
      TRIPLETEX_TEST_BASE_URL: "https://from-env.invalid/v2",
      TRIPLETEX_TEST_SESSION_TOKEN: "env-session-token",
    },
    sandboxEnvPath,
  });

  assert.deepEqual(credentials, {
    base_url: "https://from-env.invalid/v2",
    session_token: "env-session-token",
  });
});

test("loadSandboxCredentials falls back to .sandbox.env when env vars are absent", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "tripletex2-sandbox-env-"));
  const sandboxEnvPath = path.join(tempRoot, ".sandbox.env");
  await writeFile(
    sandboxEnvPath,
    [
      "TRIPLETEX_TEST_BASE_URL='https://from-file.invalid/v2'",
      'TRIPLETEX_TEST_SESSION_TOKEN="file-session-token"',
      "",
    ].join("\n"),
  );
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const credentials = await loadSandboxCredentials({
    env: {},
    sandboxEnvPath,
  });

  assert.deepEqual(credentials, {
    base_url: "https://from-file.invalid/v2",
    session_token: "file-session-token",
  });
});

test("loadSubmissionsAccessToken matches env-first fallback semantics", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "tripletex2-sandbox-env-"));
  const sandboxEnvPath = path.join(tempRoot, ".sandbox.env");
  await writeFile(
    sandboxEnvPath,
    [
      "TRIPLETEX_SUBMISSIONS_ACCESS_TOKEN=file-access-token",
      "",
    ].join("\n"),
  );
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  assert.equal(
    await loadSubmissionsAccessToken({
      env: {
        TRIPLETEX_SUBMISSIONS_ACCESS_TOKEN: "env-access-token",
      },
      sandboxEnvPath,
    }),
    "env-access-token",
  );

  assert.equal(
    await loadSubmissionsAccessToken({
      env: {},
      sandboxEnvPath,
    }),
    "file-access-token",
  );
});
