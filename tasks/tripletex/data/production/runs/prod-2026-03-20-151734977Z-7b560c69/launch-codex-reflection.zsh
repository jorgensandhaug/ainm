#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-151734977Z-7b560c69/codex-reflection.prompt.txt'
SESSION_ID='019d0bd2-c560-7972-8181-6d89b30896e2'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-151734977Z-7b560c69"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-151734977Z-7b560c69"
print "session id: 019d0bd2-c560-7972-8181-6d89b30896e2"
exec zsh -i
