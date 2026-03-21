import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TRIPLETEX2_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const REPO_ROOT = path.resolve(TRIPLETEX2_ROOT, "..", "..");

export const tripletex2Root = TRIPLETEX2_ROOT;
export const repoRoot = REPO_ROOT;
export const researchRoot = path.join(TRIPLETEX2_ROOT, "research");
export const tripletex1Root = path.join(REPO_ROOT, "tasks", "tripletex");

export function resolveResearchPath(...segments: string[]): string {
  return path.join(researchRoot, ...segments);
}

export async function readJsonFile<TValue>(filePath: string): Promise<TValue> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as TValue;
}

export async function readTextFileIfExists(
  filePath: string,
): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isFileNotFound(error)) {
      return undefined;
    }
    throw error;
  }
}

export async function writeJsonFile(
  filePath: string,
  value: unknown,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeTextFile(
  filePath: string,
  value: string,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
}

export async function listFilesRecursive(rootPath: string): Promise<string[]> {
  try {
    const entries = await readdir(rootPath, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const absolutePath = path.join(rootPath, entry.name);
        if (entry.isDirectory()) {
          return listFilesRecursive(absolutePath);
        }
        if (entry.isFile()) {
          return [absolutePath];
        }
        return [];
      }),
    );

    return nested.flat().sort();
  } catch (error) {
    if (isFileNotFound(error)) {
      return [];
    }
    throw error;
  }
}

function isFileNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
