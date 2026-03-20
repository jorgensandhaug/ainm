#!/usr/bin/env zsh
set -u
setopt aliases

alias cx='codex --dangerously-bypass-approvals-and-sandbox'

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/testing/runs/test-2026-03-19-183112872Z-b763b5c7/codex-prompt.txt'
image_args=()


cx --no-alt-screen "${image_args[@]}" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex exited with status $status"
print "run id: test-2026-03-19-183112872Z-b763b5c7"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/testing/runs/test-2026-03-19-183112872Z-b763b5c7"
print "request file: /home/jorge/repos/ainm/tasks/tripletex/data/testing/runs/test-2026-03-19-183112872Z-b763b5c7/request.json"
exec zsh -i
