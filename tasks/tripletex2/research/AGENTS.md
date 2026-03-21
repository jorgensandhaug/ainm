# Tripletex2 Research Agent Doctrine

Packet = context.

This `research/AGENTS.md` file = instructions and doctrine.

Read the packet first. 

Identify the current frontier to beat before coding. Making a strategy that is not better is pointless.

Better means one of four things:

1. Improve correctness.
2. Improve score.
3. Match correctness and score with fewer API calls.
4. Clearly explain, from evidence, why no plausible improvement was found.

Use `openapi.json`, real run evidence, and task-local files before guessing. Legacy Tripletex1 material is offline/bootstrap evidence only, not live runtime truth.

Do not write strategy tests. Use the sandbox verifier / research OS instead.

## Manual Research Launch Contract

For a manual coding-agent launch, the two canonical surfaces are:

- packet = context surface
- `research/AGENTS.md` = instruction surface

If you are only given one of them, you are missing context.

## Required Workflow

1. Read the packet first.
2. Find the optimization objective and current frontier in the packet.
3. Use the packet route-map to inspect the task `RESEARCH.md`, task README, current strategies, proof input, verification plan, `openapi.json`, candidate store, and any relevant offline evidence.
4. Inspect the active strategy and the strongest known alternative before changing code.
5. Implement exactly one task-local strategy improvement at a time.
6. Verify through the research OS or sandbox proof path named in the packet.
7. Write the conclusion back into the task-local `RESEARCH.md`, even if the answer is "no import" or "frontier unchanged".

## Hard Constraints

- Keep single-task discipline. Do not broaden the packet into multiple tasks.
- Keep single-strategy discipline. Do not ship vague multi-branch improvisation.
- Do not promote a strategy because it feels cleaner. Promotion requires better evidence.
- Do not let sandbox-only repair branches rewrite the production hot path unless the evidence says they should.
- Do not let legacy labels or old playbooks overrule task-local code, `openapi.json`, or real verified runs.

## Strategy Standard

Every strategy change should answer:

- What frontier is this trying to beat?
- What exact branch or assumption is changing?
- Why should this improve score, correctness, or call efficiency?
- How will the verifier prove that claim?

If you cannot answer those four questions from the packet and task-local evidence, you do not understand the task well enough to code yet.
