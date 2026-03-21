import type {
  TaskSpec,
  TaskStrategy,
} from "../../runtime/contracts";

export interface NotImplementedTaskInput {}

export const NOT_IMPLEMENTED_STRATEGY_SUFFIX = ".not-implemented.v1";

export class NotImplementedTaskStrategyError extends Error {
  readonly taskId: string;
  readonly strategyId: string;

  constructor(taskId: string, strategyId: string) {
    super(
      `Deterministic strategy "${strategyId}" for task "${taskId}" is not implemented.`,
    );
    this.name = "NotImplementedTaskStrategyError";
    this.taskId = taskId;
    this.strategyId = strategyId;
  }
}

export function isNotImplementedStrategyId(strategyId: string): boolean {
  return strategyId.endsWith(NOT_IMPLEMENTED_STRATEGY_SUFFIX);
}

export function createNotImplementedTaskSpec<TTaskId extends string>(input: {
  taskId: TTaskId;
  txTaskId: string;
  taskName: string;
  summary: string;
  signature?: string;
  extractionNotes?: readonly string[];
}): TaskSpec<NotImplementedTaskInput, TTaskId> {
  return {
    taskId: input.taskId,
    txTaskId: input.txTaskId,
    taskName: input.taskName,
    implementationStatus: "implemented",
    signature: input.signature ?? `unknownTask${input.taskId}()`,
    summary: input.summary,
    inputSchemaId: `${input.taskId}.v1`,
    requiredFields: [] as const,
    optionalFields: [] as const,
    extractionNotes:
      input.extractionNotes ??
      [
        "This task id is known to the registry, but its typed extraction contract is still unknown.",
        "When selected, solve dispatch should hand off to the Codex tmux solver instead of attempting a local deterministic strategy.",
      ],
  };
}

export function createNotImplementedStrategy<TTaskId extends string>(input: {
  taskId: TTaskId;
  strategyPath: string;
}): TaskStrategy<NotImplementedTaskInput, TTaskId> {
  const strategyId = `${input.taskId}.not-implemented.v1`;

  return {
    strategyId,
    strategyPath: input.strategyPath,
    taskId: input.taskId,
    name: "Not implemented",
    summary:
      "No deterministic runtime exists yet; solve dispatch must fall through to the Codex tmux solver.",
    hypothesis:
      "The best available behavior for this task family is to preserve classification coverage while handing execution to the existing Codex/tmux path.",
    expectedCallProfile: {
      targetCalls: 0,
      maxCalls: 0,
    },
    stepOutline: [
      "Do not run a local deterministic Tripletex strategy for this task id.",
      "Fall through to the Codex tmux solver so the task still gets an attempted solve.",
    ],
    status: "baseline",
    async run() {
      throw new NotImplementedTaskStrategyError(input.taskId, strategyId);
    },
  };
}
