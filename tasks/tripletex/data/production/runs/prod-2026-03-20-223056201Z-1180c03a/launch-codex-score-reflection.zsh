#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223056201Z-1180c03a/codex-score-reflection.prompt.txt'
SESSION_ID='019d0d5f-8a4e-7b71-b321-f8087263d220'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-223056201Z-1180c03a"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223056201Z-1180c03a"
print "session id: 019d0d5f-8a4e-7b71-b321-f8087263d220"
exec zsh -i
