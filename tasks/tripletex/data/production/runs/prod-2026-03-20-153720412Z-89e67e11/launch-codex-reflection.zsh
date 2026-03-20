#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-153720412Z-89e67e11/codex-reflection.prompt.txt'
SESSION_ID='019d0be4-dce6-7743-8b71-51ae1a3d72ab'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-153720412Z-89e67e11"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-153720412Z-89e67e11"
print "session id: 019d0be4-dce6-7743-8b71-51ae1a3d72ab"
exec zsh -i
