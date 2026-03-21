import {
  backfillPromptCorpus,
  resolvePromptCorpusPath,
} from "../src/runtime/prompt-corpus";

function parseArgs(argv: readonly string[]): { corpusPath?: string } {
  let corpusPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--corpus-path") {
      corpusPath = argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(
      `Unknown argument "${arg}". Supported flags: --corpus-path <path>.`,
    );
  }

  return { corpusPath };
}

const { corpusPath } = parseArgs(Bun.argv.slice(2));
const result = await backfillPromptCorpus({ corpusPath });

console.log(
  JSON.stringify(
    {
      corpusPath: resolvePromptCorpusPath(corpusPath),
      ...result,
    },
    null,
    2,
  ),
);
