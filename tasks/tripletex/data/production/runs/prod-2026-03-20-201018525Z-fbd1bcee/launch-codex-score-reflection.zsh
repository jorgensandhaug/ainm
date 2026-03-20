#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-201018525Z-fbd1bcee/codex-score-reflection.prompt.txt'
SESSION_ID='019d0cde-c5d4-7852-8eb8-34fa2c3b1f2c'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-201018525Z-fbd1bcee"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-201018525Z-fbd1bcee"
print "session id: 019d0cde-c5d4-7852-8eb8-34fa2c3b1f2c"
exec zsh -i
