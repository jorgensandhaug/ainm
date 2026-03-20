#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-190409614Z-462506c3/codex-score-reflection.prompt.txt'
SESSION_ID='019d0ca2-349b-73f2-8a34-65695f154a39'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-190409614Z-462506c3"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-190409614Z-462506c3"
print "session id: 019d0ca2-349b-73f2-8a34-65695f154a39"
exec zsh -i
