#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-163628397Z-e88605ae/codex-reflection.prompt.txt'
SESSION_ID='019d0c1a-fe03-7ec2-b98c-20fdf5b011bc'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-163628397Z-e88605ae"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-163628397Z-e88605ae"
print "session id: 019d0c1a-fe03-7ec2-b98c-20fdf5b011bc"
exec zsh -i
