#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-225435583Z-392fccac/codex-reflection.prompt.txt'
SESSION_ID='019d0d75-2cb9-7a20-921c-ceb9e36318c5'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-225435583Z-392fccac"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-225435583Z-392fccac"
print "session id: 019d0d75-2cb9-7a20-921c-ceb9e36318c5"
exec zsh -i
