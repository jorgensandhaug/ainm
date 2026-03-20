#!/usr/bin/env zsh
set -eu
set -o pipefail

PROGRAM_NAME=${0:t}

usage() {
  print "Usage: $PROGRAM_NAME <thread_id> <prompt> [max_iterations]"
  print "Default max_iterations: 20"
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if ! command -v codex >/dev/null 2>&1; then
  print -u2 "codex not found in PATH"
  exit 1
fi

if ! command -v script >/dev/null 2>&1; then
  print -u2 "script not found in PATH"
  exit 1
fi

SCRIPT_DIR=${0:a:h}
REPO_ROOT=${SCRIPT_DIR:h}
THREAD_ID="${1:-}"
PROMPT_TEXT="${2:-}"
MAX_ITERATIONS="${3:-20}"

if [[ -z "$THREAD_ID" ]]; then
  print -u2 "thread_id required"
  usage
  exit 1
fi

if [[ -z "$PROMPT_TEXT" ]]; then
  print -u2 "prompt required"
  usage
  exit 1
fi

if [[ ! "$MAX_ITERATIONS" =~ '^[0-9]+$' ]] || (( MAX_ITERATIONS < 1 )); then
  print -u2 "max_iterations must be a positive integer"
  usage
  exit 1
fi

RUN_TS="$(date -u +"%Y%m%dT%H%M%SZ")"
RUN_DIR="${TMPDIR:-/tmp}/codex-resume-loop-${RUN_TS}-$$"
LAUNCH_SCRIPT="$RUN_DIR/launch-codex-resume-loop.zsh"

mkdir -p "$RUN_DIR"

cat > "$LAUNCH_SCRIPT" <<EOF
#!/usr/bin/env zsh
set -eu
cd '$REPO_ROOT'
exec codex resume --yolo --no-alt-screen '$THREAD_ID' "\$CODEX_RESUME_LOOP_PROMPT"
EOF
chmod +x "$LAUNCH_SCRIPT"

print "repo: $REPO_ROOT"
print "thread id: $THREAD_ID"
print "prompt: provided"
print "run dir: $RUN_DIR"
print "max iterations: $MAX_ITERATIONS"

for ((iteration = 1; iteration <= MAX_ITERATIONS; iteration++)); do
  LOG_FILE="$RUN_DIR/iteration-$(printf "%03d" "$iteration").log"

  print
  print "iteration $iteration/$MAX_ITERATIONS"
  print "log: $LOG_FILE"

  # `script` keeps a PTY so `codex --yolo` behaves like a real terminal session.
  if FAMILY_1_ITERATION="$iteration" CODEX_RESUME_LOOP_PROMPT="$PROMPT_TEXT" script -q -e -c "$LAUNCH_SCRIPT" "$LOG_FILE"; then
    rc=0
  else
    rc=$?
  fi

  print
  print "codex exit: $rc"

  if (( rc != 0 )); then
    print -u2 "loop stopped on codex failure"
    exit "$rc"
  fi

  if grep -Fq '<promise>COMPLETE</promise>' "$LOG_FILE"; then
    print "completion sentinel found"
    exit 0
  fi
done

print -u2 "iteration limit reached without completion sentinel"
exit 1
