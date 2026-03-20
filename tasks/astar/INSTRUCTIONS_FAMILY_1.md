# Instructions Family 1

Use this file as the only persistent prompt for the loop.

## Mission

Dummy loop test only.

Work only under `family1_dummy/`.

Goal:

- complete the staged dummy harness in about 3 outer loop iterations
- do not touch real repo code outside `family1_dummy/`
- on each run, fix only the stage unlocked for the current outer iteration

Stage contract:

- outer iteration is provided in env var `FAMILY_1_ITERATION`
- iteration `1`: only `stage1.txt` should end up fixed
- iteration `2`: only `stage2.txt` should be newly fixed; `stage1.txt` stays fixed
- iteration `3`: only `stage3.txt` should be newly fixed; `stage1.txt` and `stage2.txt` stay fixed
- future-stage files must stay broken until their iteration unlocks

Required verification:

- run `python family1_dummy/check.py`
- if verifier says current stage complete but not all 3, stop without printing the completion sentinel
- print `<promise>COMPLETE</promise>` only when verifier says all 3 stages are complete

## Operating Rules

- Read `AGENTS.md`, `README.md`, and `docs/game_facts.md` before making claims or changes.
- Work in the current repo state. Do not revert or overwrite user changes you did not make.
- Start each run by inspecting current files, git state, and whatever prior work already exists.
- Do one coherent chunk of work per run. Prefer the next highest-leverage step, not a broad refactor.
- Run the smallest relevant verification for your changes. If blocked, say exactly what blocked you.
- Keep notes concise.
- Do not edit or fake `FAMILY_1_ITERATION`.
- Do not print or quote `<promise>COMPLETE</promise>` unless the mission is fully complete.
- When the mission is fully complete, output exactly `<promise>COMPLETE</promise>` and nothing else.

## Completion Test

Before emitting the completion sentinel, verify all of this:

- the mission in this file is fully satisfied
- required code, tests, and docs are updated
- no obvious next implementation step remains
- the repo is left in a coherent state
