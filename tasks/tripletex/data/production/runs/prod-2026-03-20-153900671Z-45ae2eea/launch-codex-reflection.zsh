#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-153900671Z-45ae2eea/codex-reflection.prompt.txt'
SESSION_ID='019d0be6-63a6-70e2-b8c6-c8a0f878ce73'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-153900671Z-45ae2eea"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-153900671Z-45ae2eea"
print "session id: 019d0be6-63a6-70e2-b8c6-c8a0f878ce73"
exec zsh -i
