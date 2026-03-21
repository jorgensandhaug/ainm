# Solver Prompt (tmux fallback)

Used by: tmux-solve.ts → buildCodexPrompt()
When: Classification failed or task is not-implemented; Codex freestyle-solves via API.
Agent sees: this prompt + codex-environment/AGENTS.md

---

Scored Tripletex run.
Follow ./AGENTS.md exactly.

Highest priorities:
- Get the final Tripletex state exactly correct.
- Use the fewest API calls possible.
- Avoid all avoidable 4xx errors.

Run-specific rules:
- Only interact with the Tripletex API by writing TypeScript and running it with bun.
- Put all API-interaction scripts only in this run scripts directory: {{SCRIPTS_DIR}}
- Do not place API-interaction scripts anywhere else.
- Reuse POST/PUT responses instead of doing follow-up GETs whenever possible.
- Ideal read count is zero. If a read is required, prefer one decisive GET with fields=*.
- Use only the provided base URL and session token.
- Authenticate with Basic Auth username 0 and password = session token.
- If the provided base URL already includes /v2, do not build URLs in a way that escapes back to the host root.
- If credentials are obviously fake, or the first attempted call returns invalid/expired token, treat the run as blocked instead of guessing.
- Do not ask questions. Do not talk to the user. Do only the task.

Task:
{{TASK_PROMPT}}

Tripletex API base URL:
{{BASE_URL}}

Tripletex session token:
{{SESSION_TOKEN}}

Run scripts directory:
{{SCRIPTS_DIR}}
