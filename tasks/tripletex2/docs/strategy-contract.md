# Tripletex2 Strategy Contract

## Purpose

This document defines what a strategy is in `tripletex2`, what belongs inside a strategy file, and what standardization rules are mandatory.

The purpose of this contract is comparability. If two strategies for the same task cannot be lined up and compared directly, the contract has failed.

## Definition

A strategy is a single TypeScript module that encodes one concrete way to solve one specific Tripletex task type.

A strategy is not:

- a prompt,
- a runbook,
- a bundle of vague instructions,
- a general planner,
- a dynamic strategy selector.

A strategy is executable doctrine for one task.

Crucially, the strategy is executed by the normal TypeScript runtime, not by an LLM reading the file and improvising from it. The LLM's role ends at classification and structured input extraction. After that handoff, the strategy should run as ordinary deterministic code.

## Scope of a strategy

A strategy file should define exactly one candidate solve procedure for exactly one task.

That means a strategy owns:

- the full API call sequence,
- the payload construction logic,
- the use of returned IDs and other response values,
- any minimal read-before-write validation it truly needs,
- any deterministic post-write verification it performs.

The important boundary is this: the strategy should receive already-extracted typed values and then execute the entire solve flow itself. For a create-employee task, the extractor might produce fields like `name`, `birthDate`, `email`, and `startDate`. The strategy should then perform the Tripletex calls end to end using those values. There should be no hidden second planning stage where the LLM interprets the strategy and decides how to execute it.

A strategy does not own:

- task classification,
- prompt language handling,
- raw file parsing into semantic values,
- choosing between multiple task types,
- choosing between multiple strategies for the same task at runtime,
- broad experiment bookkeeping.

## Standardization levels

There are two levels of standardization.

### Global standardization

All strategy files across all 30 tasks should follow the same runtime shape as much as possible.

This means they should export the same top-level structure and behave the same way from the runtime's perspective.

### Task-local standardization

All strategy files within the same task must use exactly the same input schema.

This is non-negotiable. If Task 7 strategies accept different input shapes, they are no longer directly swappable or comparable.

Within a task, every strategy must agree on:

- field names,
- field types,
- optional vs required status,
- semantic meaning of each field.

## Recommended file structure

Each task should expose its classifier-facing surface in one easy-to-read TypeScript file.

A good default shape is:

```text
src/tasks/task-07-create-customer/
  task.ts
  strategies/
    minimal-create.ts
    lookup-then-create.ts
    create-with-guard.ts
  README.md
```

`task.ts` should be the single front door for the task. A reader — especially a classifier agent — should be able to open that one file and immediately see:

- the task id,
- the task name,
- the signature,
- required and optional fields,
- the canonical input type/schema,
- the task-local strategy type alias.

Then each file in `strategies/` imports from that same `task.ts` and implements the task contract.

If a task later grows helper files, that is fine. But the canonical interface surface should still be visible in one file rather than scattered across several small files.

The default is now frozen:

```text
src/tasks/task-<slug>/
  task.ts
  strategies/
    <strategy-name>.ts
  README.md
```

New tasks should start by copying `src/tasks/_template/` and then replacing the placeholders. That keeps the repo mechanical without introducing a generator framework.

## Frozen file responsibilities

### `task.ts`

`task.ts` is the canonical front door. It should contain:

- task id constants,
- the canonical task-local input type,
- the classifier-facing `TaskSpec`,
- the task-local `TaskStrategy` alias,
- the task-local `TaskUnderstandingResult` alias if useful.

`task.ts` should not contain:

- Tripletex API call ordering,
- strategy selection logic,
- hidden helper indirection that makes the task surface harder to skim.

A frozen baseline shape is:

```ts
import type {
  TaskUnderstandingResult,
  TaskSpec,
  TaskStrategy,
} from "../../runtime/contracts";

export const TASK_ID = "replace-task-id";
export const INPUT_SCHEMA_ID = "replace-task-id.v1";

export interface ReplaceTaskInput {
  requiredValue: string;
  optionalValue?: string;
}

export const task = {
  taskId: TASK_ID,
  taskName: "Replace task name",
  signature: "replaceTask(requiredValue, optionalValue?)",
  summary: "One-sentence classifier-facing summary.",
  inputSchemaId: INPUT_SCHEMA_ID,
  requiredFields: ["requiredValue"] as const,
  optionalFields: ["optionalValue"] as const,
  fieldDescriptions: {
    requiredValue: "What the extractor should fill.",
    optionalValue: "Optional typed value if present.",
  },
  extractionNotes: [
    "The extractor should emit typed values only.",
  ] as const,
} satisfies TaskSpec<ReplaceTaskInput, typeof TASK_ID>;

export type ReplaceTaskStrategy = TaskStrategy<
  ReplaceTaskInput,
  typeof TASK_ID
>;

export type ReplaceTaskUnderstandingResult = TaskUnderstandingResult<
  ReplaceTaskInput,
  typeof TASK_ID
>;
```

### `strategies/<strategy-name>.ts`

A strategy file should contain:

- one exported `strategy` object,
- the metadata header required by `TaskStrategy`,
- one visible `run(...)` implementation,
- only the small helper functions needed to keep that file readable.

A strategy file should not contain:

- task classification behavior,
- alternate task schemas,
- hidden planning prompts,
- broad utility layers that obscure the call graph.

A frozen baseline shape is:

```ts
import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type { ReplaceTaskInput, ReplaceTaskStrategy } from "../task";
import { TASK_ID } from "../task";

export const strategy = {
  strategyId: "replace-task-id.replace-strategy.v1",
  taskId: TASK_ID,
  name: "Replace strategy name",
  summary: "One concrete solve idea.",
  hypothesis: "Why this idea may beat alternatives.",
  expectedCallProfile: {
    targetCalls: 2,
    maxCalls: 3,
  },
  stepOutline: [
    "API call 1: GET or POST the prerequisite entity.",
    "API call 2: POST or PUT the scoring action.",
  ],
  status: "draft",
  async run(
    ctx: StrategyContext,
    input: ReplaceTaskInput,
  ): Promise<StrategyResult> {
    // API call 1: do the prerequisite lookup or create.

    // API call 2: do the scoring write using data from call 1.

    return {
      notes: ["Replace template notes with task-specific output."],
    };
  },
} satisfies ReplaceTaskStrategy;
```

### `README.md`

`README.md` is optional runtime-wise but canonical repo-wise. It should stay short and cover:

- what the task means in plain language,
- which strategy files currently exist,
- any evaluator assumptions or known quirks that matter to future strategy work.

It should not be required reading for the classifier or for understanding the task interface. That information belongs in `task.ts`.

## Design goal: small readable optimization surfaces

The strategy layer should reduce complexity, not move it around.

A future coding agent should be able to optimize a task by reading:

1. `task.ts` to understand the task surface,
2. one strategy file to understand one concrete solve path,
3. run artifacts to understand how that strategy performed.

If the architecture forces an agent to read a large pile of framework code before it can understand a task, the layer has become counterproductive.

## Required strategy metadata

Every strategy file should declare metadata that makes it inspectable without reading the implementation body.

At minimum:

- `strategyId`: unique identifier for this concrete strategy implementation,
- `taskId`: the task this strategy belongs to,
- `name`: optional human-readable label,
- `summary`: one-paragraph explanation of the idea,
- `hypothesis`: why this strategy might outperform alternatives,
- `expectedCallProfile`: the intended rough call pattern or budget,
- `status`: draft, active, retired, superseded, baseline, etc.

Example:

```ts
export const strategy = {
  strategyId: "task07.minimal-create.v1",
  taskId: "task07",
  name: "Minimal customer create",
  summary: "Assumes the task always targets a new customer and avoids preflight reads.",
  hypothesis: "Beats lookup-first variants on efficiency when duplicates are not part of the evaluator.",
  expectedCallProfile: {
    targetCalls: 1,
    maxCalls: 2,
  },
  stepOutline: [
    "API call 1: POST /customer with extracted customer fields",
  ],
  status: "draft",
  run,
} satisfies TaskStrategy<Task07Input>;
```

## Required runtime contract

We want one global runtime contract where possible, with task-specific input types.

The canonical code-level definitions for these shared types live in `src/runtime/contracts.ts`.

A good baseline shape is:

```ts
export interface TaskStrategy<TInput> {
  strategyId: string;
  taskId: string;
  name: string;
  summary: string;
  hypothesis: string;
  expectedCallProfile?: {
    targetCalls?: number;
    maxCalls?: number;
  };
  stepOutline: readonly string[];
  status: "draft" | "active" | "retired" | "superseded" | "baseline";
  run(ctx: StrategyContext, input: TInput): Promise<StrategyResult>;
}
```

The presence of `run(...)` does not mean the strategy is still "LLM executed." It means the strategy is a real programmatic implementation that the runtime invokes directly.

The presence of `stepOutline` is deliberate. Every strategy should expose a short, ordered, human-readable outline of its solve flow so readers can quickly compare the intended call graph before reading the code body.

Where `StrategyContext` should hold shared execution facilities such as:

- Tripletex client,
- logger,
- run metadata,
- optional dry-run hooks,
- timing/deadline helpers,
- artifact writers.

And `StrategyResult` should return deterministic execution output such as:

- primary entities created or modified,
- IDs returned by Tripletex,
- any strategy-level notes,
- any structured verification details.

## Required task input contract

Each task should define one canonical task input type.

Example:

```ts
export const Task07InputSchema = z.object({
  customerName: z.string(),
  organizationNumber: z.string().optional(),
  email: z.string().optional(),
  phoneNumber: z.string().optional(),
  isCustomer: z.boolean().default(true),
});

export type Task07Input = z.infer<typeof Task07InputSchema>;
```

The classifier/extractor layer should produce this shape. All Task 7 strategies should consume this exact shape.

If the extractor improves later, it may fill fields more reliably. But it must still target the same task-local schema unless there is a deliberate schema migration.

That schema should also be exposed through a task-level spec object that makes the task surface explicit for the classifier.

A useful shape is something like:

```ts
export interface Task07Input {
  customerName: string;
  organizationNumber?: string;
  email?: string;
  phoneNumber?: string;
}

export const task07Spec = {
  taskId: "task07",
  taskName: "create-customer",
  signature: "create-customer(customerName, organizationNumber?, email?, phoneNumber?)",
  summary: "Create a customer record from extracted customer identity fields.",
  inputSchemaId: "task07.create-customer.v1",
  requiredFields: ["customerName"],
  optionalFields: ["organizationNumber", "email", "phoneNumber"],
  extractionNotes: [
    "The extractor should emit typed slot values only.",
  ],
} satisfies TaskSpec<Task07Input, "task07">;

export type Task07Strategy = TaskStrategy<Task07Input, "task07">;
```

Putting these next to each other in the same `task.ts` file is intentional. A classifier agent should be able to read one file and see the full surface of the task without jumping between interface files, schema files, and strategy files.

The important thing is that arity and slot names become first-class data, not just something implied by reading the TypeScript type. That gives the classifier a much clearer target.

The practical intent is that a classifier agent should usually only need to read `task.ts`, not every strategy file for the task.

## What a strategy file may decide

A strategy file may decide:

- whether to create directly or perform a read first,
- which exact endpoints to call,
- what fields to send when multiple valid payload shapes exist,
- how to use response values from earlier calls,
- how much deterministic verification to perform,
- when to fail fast because required inputs are missing.

## What a strategy file may not decide

A strategy file may not decide:

- which task the prompt belongs to,
- whether another task's strategy is better,
- how to parse multilingual prompt phrasing in general,
- whether to consult a runbook for live behavioral guidance,
- whether to silently mutate the task-local input schema,
- whether to introduce hidden non-Tripletex side effects,
- whether to delegate solve planning back to an LLM.

## Required implementation qualities

Every strategy should be:

- deterministic,
- explicit about assumptions,
- small enough to inspect quickly,
- named by idea, not by vague adjectives,
- self-describing through metadata,
- testable in isolation,
- structured so a reader can follow the flow as a numbered API-call sequence.

A strategy should read more like a tiny workflow program than a blob of smart code. The preferred style is to make the execution path painfully obvious. A good reader experience is:

- see the extracted input shape,
- see the high-level step outline,
- open `run(...)`,
- read `API call 1`, `API call 2`, `API call 3`,
- understand exactly how response data flows into later calls.

If a strategy body is clever but hard to trace, it is violating the spirit of the contract.

## Complexity budget

This architecture only works if the optimization surface stays small and legible.

So we should bias toward a simple complexity budget:

- `task.ts` should ideally stay compact enough to skim in one pass,
- a strategy file should ideally stay short enough that a coding agent can understand it without heavy summarization,
- if a strategy becomes long, only the boring mechanics should move out,
- the interesting solve path should remain visible in the strategy file.

This is a guideline, not a hard compiler rule. But the spirit matters.

A slightly repetitive 120-line strategy that shows the whole solve path is better than a 50-line strategy whose real behavior is hidden behind three helper layers.

## What should stay in the strategy file

These things usually belong directly in the strategy file:

- the ordered API call sequence,
- the main branching logic,
- payload decisions that matter for scoring,
- reuse of IDs from earlier calls,
- comments or structure that make `API call 1`, `API call 2`, etc. obvious.

These are the parts we want humans and coding agents to compare and optimize.

## What can move into shared helpers

Only boring, reusable mechanics should move out into shared runtime/helper code, for example:

- Tripletex HTTP client plumbing,
- generic response wrapper types,
- small validators,
- date normalization helpers,
- amount parsing/format helpers,
- tiny utility functions that do not hide the solve path.

If extracting a helper makes the strategy materially harder to understand, that extraction was a mistake.

Good strategy names:

- `direct-create-no-lookup`
- `lookup-customer-then-invoice`
- `invoice-with-order-reuse`

Bad strategy names:

- `final`
- `better`
- `v2-real`
- `new-new`

## Classifier-facing task surface

Arity is useful, but arity alone is not enough.

Several tasks may have the same number of required inputs while meaning completely different things. So each task should expose a classifier-facing surface that includes at least:

- `taskId`
- `taskName`
- `signature`
- `requiredFields`
- `optionalFields`
- the canonical `inputSchema`

This means the classifier can see, for example, that one task is:

- `create-employee(name, birthDate, email, startDate)`

while another is:

- `create-customer(name, organizationNumber, email, phoneNumber?)`

Both may have similar arity, but their semantic surface is different.

The classifier should classify against this registry of task surfaces, not against raw strategy code. Strategy code comes after classification.

## Task-understanding contract

The code-level contract for the task-understanding layer lives in `src/runtime/contracts.ts`.

The Codex agent receives the prompt, optional files, and the registered task surfaces, then returns a minimal typed handoff:

- `TaskUnderstandingResolved<TInput, TTaskId>` — `{ status: "resolved", taskId, input }` for a confident task match with extracted typed values
- `TaskUnderstandingUnresolved<TInput, TTaskId>` — `{ status: "unresolved", code, message, taskId?, partialInput? }` for ambiguous or failed classification/extraction

This boundary is deliberate: the task-understanding step returns task identity and typed values only. It must not return a solve plan, API-call outline, or strategy-selection hint. The runtime picks the pinned strategy deterministically after receiving the handoff.

The Codex task-understanding agent is configured via `codex-environment/TASK_UNDERSTANDING.md` and executed through `codex exec`.

## Example mental model

Take a prompt like:

> Vi har en ny ansatt som heter Astrid Johansen, født 10. June 1989. Opprett vedkommende som ansatt med e-post astrid.johansen@example.org og startdato 25. October 2026.

The intended architecture is:

1. the classifier labels this as the create-employee task,
2. the extractor produces a typed object such as `{ name, birthDate, email, startDate }`,
3. the selected create-employee strategy receives exactly that object,
4. the TypeScript strategy executes the full flow deterministically.

The strategy should not contain fuzzy prompt understanding logic, and the LLM should not be asked to "reason through the strategy." The strategy file itself should make the solve path explicit, for example:

- API call 1: `POST /employee` with the extracted employee fields
- API call 2: if needed, call the next endpoint using the returned employee id
- API call 3: optional deterministic verification only if the strategy explicitly requires it

That is the level of programmatic clarity we want.

## Comparison rules

The whole point of the contract is to compare strategies.

That means each strategy should be easy to compare on at least these dimensions:

- score achieved,
- correctness achieved,
- API call count,
- 4xx cleanliness,
- latency,
- assumptions made,
- code complexity,
- failure modes.

If two strategies are hard to compare because they hide behavior in helper prompts, dynamic branching, or undocumented conventions, the standardization is insufficient.

## Versioning and identity

For now, strategy identity should stay simple.

The primary identifier is `strategyId`, declared in the strategy file header and recorded in every run artifact.

The important rule is that `strategyId` should identify one concrete strategy implementation, not a moving target. If the strategy changes in a meaningfully different way, give the new implementation a new `strategyId` rather than silently evolving the old one.

Examples:

- `t12_s01`
- `t12_s02`
- `t12_s03`

or, if we still want a little readability:

- `task12_direct_create_a`
- `task12_direct_create_b`

Human-readable naming is optional. Stability is the real requirement.

This means we do **not** need to make git commit or file hash part of the canonical identity right now. Simplicity wins, as long as we preserve the invariant that a recorded `strategyId` always points to one specific concrete strategy idea.

## Allowed leniency

We want as much global standardization as possible, but not fake uniformity.

Some tasks may genuinely need:

- richer extracted inputs,
- multi-entity outputs,
- file-derived structured fields,
- more defensive preflight reads,
- task-specific helper modules.

That is acceptable.

The rule is not “all tasks must look identical internally.” The rule is “all strategies must look standardized from the outside, and all strategies within a task must remain directly swappable.”

## Promotion and retirement

Strategies should not be deleted casually.

If a strategy becomes obsolete, mark it as `superseded` or `retired` and keep it inspectable. The repo is a strategy search history, not just a runtime bundle.

Deleting a strategy should be rare and reserved for cases like:

- duplicate accidental copies,
- clearly broken junk that was never meaningfully part of the search,
- sensitive data accidents.

## Contract test

A useful mental test is this:

If a future coding agent is asked,

> Compare these two Task 18 strategies and propose a new one with a hard budget of 3 API calls.

then the agent should be able to answer by reading code plus run logs, without needing hidden oral tradition from chat history.

If that is true, the strategy contract is doing its job.
