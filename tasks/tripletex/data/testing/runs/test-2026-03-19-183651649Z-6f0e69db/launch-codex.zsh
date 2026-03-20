#!/usr/bin/env zsh
set -u
setopt aliases

alias cx='codex --dangerously-bypass-approvals-and-sandbox'

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/testing/runs/test-2026-03-19-183651649Z-6f0e69db/codex-prompt.txt'

cx --no-alt-screen "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex exited with status $status"
print "run id: test-2026-03-19-183651649Z-6f0e69db"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/testing/runs/test-2026-03-19-183651649Z-6f0e69db"
print "request file: /home/jorge/repos/ainm/tasks/tripletex/data/testing/runs/test-2026-03-19-183651649Z-6f0e69db/request.json"
exec zsh -i
