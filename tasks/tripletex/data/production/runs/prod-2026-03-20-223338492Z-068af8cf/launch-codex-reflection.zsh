#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223338492Z-068af8cf/codex-reflection.prompt.txt'
SESSION_ID='019d0d62-0382-7622-912d-5af226b56c92'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-223338492Z-068af8cf"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223338492Z-068af8cf"
print "session id: 019d0d62-0382-7622-912d-5af226b56c92"
exec zsh -i
