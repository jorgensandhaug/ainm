#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-130346741Z-2654ee59/codex-reflection.prompt.txt'
SESSION_ID='df5e2c8c-e062-4209-84ea-3641117d4d40'
STATUS_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-130346741Z-2654ee59/codex-reflection.runtime-status.json'
write_status() {
  local run_status="$1"
  local run_exit_code="$2"
  local recorded_at
  recorded_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  cat > "$STATUS_FILE" <<EOF
{
  "status": "$run_status",
  "provider": "claude",
  "run_id": "prod-2026-03-21-130346741Z-2654ee59",
  "request_id": "4816f0f7",
  "recorded_at": "$recorded_at",
  "exit_code": $run_exit_code
}
EOF
}

write_status "running" 0


unset CLAUDE_CODE_USE_VERTEX
unset ANTHROPIC_VERTEX_PROJECT_ID
unset CLOUD_ML_REGION
export ANTHROPIC_BASE_URL='https://europe-west1-ai-nm26osl-1706.cloudfunctions.net/claude-proxy'
export ANTHROPIC_API_KEY='HALLAGUTTA123'
REFLECTION_OUTPUT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-130346741Z-2654ee59/codex-reflection.summary.md'
claude -r 'df5e2c8c-e062-4209-84ea-3641117d4d40' --model 'claude-opus-4-6' --effort 'high' --add-dir '/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-130346741Z-2654ee59' --dangerously-skip-permissions -p --output-format text "$(cat "$PROMPT_FILE")" > "$REFLECTION_OUTPUT_FILE"
agent_exit_code=$?
write_status "exited" $agent_exit_code

print
print "claude reflection resume exited with status $agent_exit_code"
print "run id: prod-2026-03-21-130346741Z-2654ee59"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-130346741Z-2654ee59"
print "session id: df5e2c8c-e062-4209-84ea-3641117d4d40"
exec zsh -i
