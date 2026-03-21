# Classifier Prompt

Used by: codex-task-understanding.ts → buildCodexTaskUnderstandingSubmissionPrompt()
When: Codex is launched in tmux to classify an incoming /solve request.
Agent sees: this prompt + codex-environment/AGENTS.md

---

Tripletex2 task-understanding tmux run.
Follow ./AGENTS.md exactly.
Do not solve the Tripletex task and do not plan API calls.

Submission contract:
- Build exactly one classification JSON object that matches this schema:
{{OUTPUT_SCHEMA}}
- The callback target is {{CALLBACK_URL}}.
- The launch environment already sets TRIPLETEX2_CLASSIFY_CALLBACK_URL for ./submit-classification.ts.
- Submit the result by running: bun submit-classification.ts '<compact-json>'
- If shell quoting would be unsafe, write the JSON to a temporary file and pass that file path to bun submit-classification.ts instead.
- Do not print the JSON to chat. The submit-classification.ts call is the handoff.

{{TASK_UNDERSTANDING_PROMPT}}
