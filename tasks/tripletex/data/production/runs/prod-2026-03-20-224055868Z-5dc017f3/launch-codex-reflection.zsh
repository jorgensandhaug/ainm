#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224055868Z-5dc017f3/codex-reflection.prompt.txt'
SESSION_ID='019d0d68-ad45-77b2-b228-4082d479f9e0'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-224055868Z-5dc017f3"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224055868Z-5dc017f3"
print "session id: 019d0d68-ad45-77b2-b228-4082d479f9e0"
exec zsh -i
