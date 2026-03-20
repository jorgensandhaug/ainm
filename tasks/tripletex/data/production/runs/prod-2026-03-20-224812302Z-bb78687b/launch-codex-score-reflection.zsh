#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224812302Z-bb78687b/codex-score-reflection.prompt.txt'
SESSION_ID='019d0d6f-53bc-7740-a682-b827635c0d5f'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-224812302Z-bb78687b"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224812302Z-bb78687b"
print "session id: 019d0d6f-53bc-7740-a682-b827635c0d5f"
exec zsh -i
