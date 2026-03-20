# Task Template

Copy this folder to start a new task.

What is frozen here:

- `task.ts` is the classifier-facing front door.
- `task.ts` also exports the registry-facing loader for the task module.
- `strategies/example-strategy.ts` shows the required strategy metadata and the visible `run(...)` shape.
- Keep the interesting solve path in the strategy file. Only move boring mechanics into helpers.

What to replace immediately:

- folder name,
- task id constants,
- input field names,
- strategy id and strategy name,
- step outline,
- the placeholder `run(...)` body.
