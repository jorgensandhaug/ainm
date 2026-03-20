#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-225706648Z-75efe89d/codex-score-reflection.prompt.txt'
SESSION_ID='019d0d77-7c99-7b52-b047-45c1bc02b007'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-225706648Z-75efe89d"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-225706648Z-75efe89d"
print "session id: 019d0d77-7c99-7b52-b047-45c1bc02b007"
exec zsh -i
