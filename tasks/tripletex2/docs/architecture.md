# Tripletex2 Architecture

## Purpose

This document defines the architectural north star for `tripletex2`.

The goal is not to build a generally flexible accounting agent. The goal is to find the optimal solution for each of the 30 fixed Tripletex task types in the competition. Everything in this repo should serve that objective.

## The actual game we are playing

The competition gives us one submission at a time, but the scoreboard is not measuring a single generic agent. It is effectively measuring our best-known solution for each of 30 task types.

Each task type appears in many prompt variants, but the underlying workflow should be close to fixed. The prompt language changes. Names, dates, phone numbers, org numbers, products, amounts, and other business values change. The optimal solve structure should not.

This means Tripletex is better modeled as a finite optimization problem over 30 workflow classes than as an open-ended reasoning problem.

## Why the old architecture is wrong for this objective

The old direction leaned on a coding agent plus markdown runbooks. That can work for broad exploration, but it is the wrong abstraction for this competition.

A runbook-driven agent keeps too much logic in freeform model behavior. That makes strategies harder to compare, harder to reproduce, harder to improve deliberately, and more vulnerable to latency, rate limits, and model drift. Most importantly, it does not treat the 30 tasks as explicit optimization targets.

We do not want a system that is merely capable of solving a prompt. We want a system that can:

1. identify which of the 30 tasks a prompt belongs to,
2. extract the required parameter values,
3. execute a concrete strategy implementation for that task,
4. record the result precisely,
5. compare that result against alternative strategies,
6. iterate toward the optimum.

## North star

The primary north star is this:

> Turn Tripletex from a fuzzy agent problem into a measurable per-task strategy optimization system.

Everything else is downstream of that.

Standardization matters because it enables rigorous comparison. Lower LLM reliance matters because it improves interpretability and runtime reliability. Reuse across tasks matters because many workflows will share structural motifs. But those are secondary benefits.

The main point is that strategies must be concrete enough to inspect side by side and improve under explicit constraints such as:

- preserve correctness,
- reduce call count,
- avoid 4xx errors,
- fit inside a hard API-call budget,
- combine the best parts of two prior strategies.

## Core system model

The system should be split into five conceptual layers.

### 1. Task understanding layer

This layer is the narrow place where LLMs remain useful.

Its job is to:

- read the prompt and optional files,
- determine which task type the submission belongs to,
- extract the task-specific structured inputs,
- hand those extracted values to the deterministic runtime.

Its job is not to plan API calls from scratch.

The extractor output should be as boring as possible: plain typed values such as `name`, `birthDate`, `email`, and `startDate` for a create-employee task. It should not emit a pseudo-plan, natural-language execution instructions, or any freeform strategy text. The LLM should hand over values, not behavior.

### 2. Task registry

The system should have an explicit registry of all 30 tasks.

Each task should have:

- a stable `taskId`,
- a human-readable name,
- a classifier-facing task surface,
- a task-local input schema,
- a folder containing candidate strategy implementations,
- metadata or derived summaries that show current status.

This registry is what turns the problem into a finite search space.

The key point is that the classifier should not have to infer a task's shape by spelunking through strategy files. Each task should publish a clear interface surface up front: what operation this task represents, what slots it expects, which fields are required, which are optional, and therefore what kind of extracted object the classifier is trying to produce.

### 3. Strategy selection layer

Runtime strategy choice should be externally configured, not decided ad hoc by the LLM.

For each task, there should be a clear active strategy selection. In experiment mode, the configuration should pin exactly one strategy per task. That lets us run controlled experiments where the only moving parts are task classification, slot extraction, and the configured strategy implementation.

The runtime should not improvise between multiple strategies for the same task unless a future spec explicitly adds that capability.

### 4. Deterministic strategy runtime

A strategy is executable code, not a note.

The runtime should import and execute the TypeScript strategy directly. The LLM should not "execute the strategy" in the sense of reading the code and deciding what to do. Once task classification and slot extraction are done, the rest of the solve path should be ordinary deterministic program execution.

Given task-specific structured inputs plus execution context, the strategy should deterministically define:

- which Tripletex endpoints to call,
- in what order,
- how to construct the request payloads,
- how to reuse response data such as returned IDs,
- what minimal validation is necessary,
- when execution is done.

In other words, the strategy file should be readable as a concrete solve program: API call 1, API call 2, API call 3, and so on. A future reader should be able to open a strategy file and follow the exact flow without needing to imagine hidden LLM reasoning between the steps.

This is the core of the system.

### 5. Evidence and learning layer

Every run should leave behind a durable, append-only evidence trail.

Runs should record:

- which task was targeted,
- which strategy was executed,
- which exact strategy version was used,
- what structured inputs were extracted,
- what happened during execution,
- what score or evaluation outcome came back.

That evidence is how we compare strategies and decide what to improve next.

## System principles

### Determinism over improvisation

If the same task type and extracted inputs go in, the same strategy behavior should come out.

### Code over prose

Strategies must live in TypeScript code, not only in markdown descriptions. We need exact, inspectable implementations.

### Standardization over cleverness

A strategy format that is slightly restrictive but highly comparable is better than a flexible format that makes strategies hard to line up and judge.

### Legibility over abstraction

The strategy layer exists to make task optimization easier for humans and coding agents. If the architecture makes strategies harder to read, more token-dense, or more indirect, it is failing.

That means:

- each task should publish its surface in one obvious `task.ts` front-door file,
- each strategy should read like a short solve program,
- shared helpers should absorb only boring mechanics,
- the interesting solve path should remain visible in the strategy file.

A slightly repetitive strategy that is easy to inspect is better than a heavily abstracted strategy whose real behavior is hidden behind helper layers.

### Append-only evidence

Run records should not be overwritten. Summaries can be regenerated. Evidence should stay immutable.

### Human-readable source of truth

Canonical research history should live in git-friendly text artifacts. We should avoid making a binary database the canonical experiment store.

### Narrow LLM surface area

LLMs should classify and extract. They should not own solve planning when deterministic strategy code can own it instead.

## Non-goals

These are explicitly not the primary goals of `tripletex2`.

- Building the most flexible general accounting agent.
- Letting the runtime creatively improvise between multiple solve paths.
- Hiding strategy logic inside prompts or runbooks.
- Optimizing for elegance over comparability.
- Treating every submission as a fresh reasoning problem.

## Proposed repository shape

This is the intended directional structure. Exact paths may evolve, but the shape should remain.

```text
tripletex2/
  docs/
    architecture.md
    strategy-contract.md
    run-log-spec.md
    research-workflow.md
  src/
    runtime/
    registry/
    tasks/
      task-01-.../
        task.ts
        strategies/
          <strategy-id>.ts
        README.md
      task-02-.../
        ...
  configs/
    active-strategies.json
  runs/
    2026-03-20/
      <run-id>.json
  reports/
    task-status.json
    strategy-frontiers.json
```

The key idea is that task folders hold code and task-local structure, while run artifacts hold evidence and reports hold derived summaries.

Within a task folder, `task.ts` should stay small and classifier-facing, while each strategy file should stay focused on the concrete solve path. If a strategy starts to feel like framework code, the abstraction has probably gone too far.

## Frozen task folder template

The default per-task shape is now intentionally frozen so future task folders can be copied mechanically:

```text
src/tasks/task-<slug>/
  task.ts
  strategies/
    <strategy-name>.ts
  README.md
```

Optional helper files are allowed, but they are not part of the canonical front door.

- `task.ts` is the one-file classifier-facing surface for the task. It should declare the task id, input schema id, canonical input type, `TaskSpec`, and task-local strategy aliases. It should not hide API sequencing or scoring-sensitive behavior.
- `strategies/*.ts` hold one concrete solve path each. A strategy file should read like a short numbered Tripletex workflow program, not a framework entrypoint.
- `README.md` holds short task-local notes for humans such as evaluator assumptions, current strategy inventory, or known quirks. It must not be the only place where the task interface is explained.
- Shared helpers may absorb boring mechanics, but they must not hide the optimization surface. If moving code out makes the solve path harder to inspect, the extraction was a mistake.

The practical rule is simple: a future agent should usually only need to read `task.ts`, one strategy file, and the relevant run artifacts to improve a task.

## Design consequences

This architecture changes how we should work.

We should no longer ask questions like:

- “How do we make the agent smarter overall?”
- “Can Codex figure out the task from the docs?”

We should instead ask:

- “What is the canonical strategy search space for Task 12?”
- “Which two Task 12 strategies are currently strongest?”
- “Can we synthesize a new Task 12 strategy that preserves correctness in one fewer call?”
- “Which tasks are solved and which remain open optimization targets?”

That is the right operating mindset for this repo.

## Success criteria for the refactor

The refactor is successful when:

1. every submission can be routed into an explicit task and strategy,
2. strategy implementations are standardized enough to compare directly,
3. run history tells us exactly what was tried and how it performed,
4. future sessions can continue the optimization loop without relying on chat memory,
5. the system becomes more deterministic, more interpretable, and less LLM-dependent over time.
