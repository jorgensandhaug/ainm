#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-222536607Z-8596c03c/codex-reflection.prompt.txt'
SESSION_ID='019d0d5a-a5cd-7e41-849e-c59c68fee89e'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-222536607Z-8596c03c"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-222536607Z-8596c03c"
print "session id: 019d0d5a-a5cd-7e41-849e-c59c68fee89e"
exec zsh -i
