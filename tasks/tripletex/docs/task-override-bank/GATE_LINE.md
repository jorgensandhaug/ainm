# Gate Line for AGENTS.md

Add this as the VERY FIRST LINE of `codex-environment/AGENTS.md`:

```
**TASK OVERRIDE**: If `./TASK_OVERRIDE.md` exists, read it FIRST and follow it exclusively. The task is already identified — skip all classification, playbook selection, and trusted-standard matching. If the incoming prompt clearly does not match the override description, say so and stop.
```

## Deployment commands

### Deploy an override (e.g., task 30):
```bash
cp tasks/tripletex/docs/task-override-bank/task-30.md tasks/tripletex/codex-environment/TASK_OVERRIDE.md
```

### Clear override (return to normal):
```bash
rm -f tasks/tripletex/codex-environment/TASK_OVERRIDE.md
```

### Quick-switch between tasks:
```bash
# Switch to task 23
cp tasks/tripletex/docs/task-override-bank/task-23.md tasks/tripletex/codex-environment/TASK_OVERRIDE.md

# Switch to task 12
cp tasks/tripletex/docs/task-override-bank/task-12.md tasks/tripletex/codex-environment/TASK_OVERRIDE.md
```
