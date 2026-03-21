import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface SandboxCredentials {
  base_url: string;
  session_token: string;
}

export interface SandboxCredentialLoadOptions {
  env?: Record<string, string | undefined>;
  sandboxEnvPath?: string;
}

const tripletex2Root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const defaultSandboxEnvPath = path.join(tripletex2Root, ".sandbox.env");

export async function loadSandboxCredentials(
  options: SandboxCredentialLoadOptions = {},
): Promise<SandboxCredentials | undefined> {
  const env = options.env ?? Bun.env;
  const baseUrl = env.TRIPLETEX_TEST_BASE_URL;
  const sessionToken = env.TRIPLETEX_TEST_SESSION_TOKEN;
  if (baseUrl && sessionToken) {
    return {
      base_url: baseUrl,
      session_token: sessionToken,
    };
  }

  try {
    const raw = await readFile(options.sandboxEnvPath ?? defaultSandboxEnvPath, "utf8");
    const parsed = parseEnvFile(raw);
    if (parsed.TRIPLETEX_TEST_BASE_URL && parsed.TRIPLETEX_TEST_SESSION_TOKEN) {
      return {
        base_url: parsed.TRIPLETEX_TEST_BASE_URL,
        session_token: parsed.TRIPLETEX_TEST_SESSION_TOKEN,
      };
    }
  } catch {
    // ignore missing local sandbox file
  }

  return undefined;
}

export async function loadSubmissionsAccessToken(
  options: SandboxCredentialLoadOptions = {},
): Promise<string> {
  const env = options.env ?? Bun.env;
  const envToken = env.TRIPLETEX_SUBMISSIONS_ACCESS_TOKEN;
  if (envToken) {
    return envToken;
  }

  try {
    const raw = await readFile(options.sandboxEnvPath ?? defaultSandboxEnvPath, "utf8");
    const parsed = parseEnvFile(raw);
    return parsed.TRIPLETEX_SUBMISSIONS_ACCESS_TOKEN ?? "";
  } catch {
    return "";
  }
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
