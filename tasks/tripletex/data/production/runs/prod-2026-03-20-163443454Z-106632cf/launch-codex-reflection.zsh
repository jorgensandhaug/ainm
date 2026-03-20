#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-163443454Z-106632cf/codex-reflection.prompt.txt'
SESSION_ID='019d0c19-64fb-7823-aea7-fdbb25e7ab95'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-163443454Z-106632cf"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-163443454Z-106632cf"
print "session id: 019d0c19-64fb-7823-aea7-fdbb25e7ab95"
exec zsh -i
