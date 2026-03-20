#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-151341523Z-1e345deb/codex-reflection.prompt.txt'
SESSION_ID='019d0bcf-3cb6-7793-84a6-bff7f86f9536'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-151341523Z-1e345deb"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-151341523Z-1e345deb"
print "session id: 019d0bcf-3cb6-7793-84a6-bff7f86f9536"
exec zsh -i
