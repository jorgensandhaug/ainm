#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-122855405Z-4de37311/codex-score-reflection.prompt.txt'
SESSION_ID='8ab28496-e288-41c3-b783-07b55a6f3340'
STATUS_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-122855405Z-4de37311/codex-reflection.runtime-status.json'
REFLECTION_OUTPUT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-122855405Z-4de37311/codex-reflection.summary.md'
write_status() {
  local run_status="$1"
  local run_exit_code="$2"
  local recorded_at
  recorded_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  cat > "$STATUS_FILE" <<EOF
{
  "status": "$run_status",
  "provider": "claude",
  "run_id": "prod-2026-03-22-122855405Z-4de37311",
  "request_id": "5a66e911",
  "recorded_at": "$recorded_at",
  "exit_code": $run_exit_code
}
EOF
}

write_status "running" 0
trap 'write_status "killed" 137' INT TERM HUP

unset CLAUDE_CODE_USE_VERTEX
unset ANTHROPIC_VERTEX_PROJECT_ID
unset CLOUD_ML_REGION
export ANTHROPIC_BASE_URL='https://europe-west1-ai-nm26osl-1706.cloudfunctions.net/claude-proxy'
export ANTHROPIC_API_KEY='HALLAGUTTA123'
claude -r "$SESSION_ID" --model 'claude-opus-4-6' --effort 'high' --add-dir '/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-122855405Z-4de37311' --dangerously-skip-permissions -p --output-format text "$(cat "$PROMPT_FILE")" > "$REFLECTION_OUTPUT_FILE"
agent_exit_code=$?
trap - INT TERM HUP
write_status "exited" $agent_exit_code

print
print "claude reflection resume exited with status $agent_exit_code"
print "run id: prod-2026-03-22-122855405Z-4de37311"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-122855405Z-4de37311"
print "session id: 8ab28496-e288-41c3-b783-07b55a6f3340"
exec zsh -i
