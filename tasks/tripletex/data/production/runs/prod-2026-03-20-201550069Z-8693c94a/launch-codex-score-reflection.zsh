#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-201550069Z-8693c94a/codex-score-reflection.prompt.txt'
SESSION_ID='019d0ce3-d62e-7112-92b7-4538d0ffb99b'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-201550069Z-8693c94a"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-201550069Z-8693c94a"
print "session id: 019d0ce3-d62e-7112-92b7-4538d0ffb99b"
exec zsh -i
