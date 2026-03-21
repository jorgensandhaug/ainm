interface PendingCodexTaskUnderstandingResult {
  resolve: (rawResponseText: string) => void;
  settled: boolean;
}

const pendingCodexTaskUnderstandingResults = new Map<
  string,
  PendingCodexTaskUnderstandingResult
>();

export interface RegisteredCodexTaskUnderstandingResult {
  cleanup: () => void;
  promise: Promise<string>;
}

export function registerPendingCodexTaskUnderstandingResult(
  requestId: string,
): RegisteredCodexTaskUnderstandingResult {
  if (pendingCodexTaskUnderstandingResults.has(requestId)) {
    throw new Error(
      `A Codex task-understanding callback is already pending for requestId "${requestId}".`,
    );
  }

  let resolvePromise!: (rawResponseText: string) => void;
  const pending: PendingCodexTaskUnderstandingResult = {
    settled: false,
    resolve: (rawResponseText) => {
      if (pending.settled) {
        return;
      }

      pending.settled = true;
      pendingCodexTaskUnderstandingResults.delete(requestId);
      resolvePromise(rawResponseText);
    },
  };

  const promise = new Promise<string>((resolve) => {
    resolvePromise = resolve;
  });
  pendingCodexTaskUnderstandingResults.set(requestId, pending);

  return {
    promise,
    cleanup: () => {
      if (pending.settled) {
        return;
      }

      pending.settled = true;
      pendingCodexTaskUnderstandingResults.delete(requestId);
    },
  };
}

export function resolvePendingCodexTaskUnderstandingResult(
  requestId: string,
  rawResponseText: string,
): boolean {
  const pending = pendingCodexTaskUnderstandingResults.get(requestId);
  if (!pending) {
    return false;
  }

  pending.resolve(rawResponseText);
  return true;
}
