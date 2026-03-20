#!/usr/bin/env zsh
set -eu
set -o pipefail

PROGRAM_NAME=${0:t}
SLEEP_BETWEEN_ITERATIONS_SECONDS=60
PREVIEW_CHAR_COUNT=1000

usage() {
  print "Usage: $PROGRAM_NAME -t <thread_id> -p <prompt> [-n max_iterations]"
  print "Default max_iterations: 20"
}

print_preview() {
  local label="$1"
  local path="$2"
  local content

  if [[ ! -s "$path" ]]; then
    return 1
  fi

  content="$(<"$path")"
  print -r -- "$label"
  print -r -- "${content[1,$PREVIEW_CHAR_COUNT]}"
  print
  print -r -- "--- end preview ---"
  return 0
}

THREAD_ID=""
PROMPT_TEXT=""
MAX_ITERATIONS="20"

while getopts ":t:p:n:h" opt; do
  case "$opt" in
    t)
      THREAD_ID="$OPTARG"
      ;;
    p)
      PROMPT_TEXT="$OPTARG"
      ;;
    n)
      MAX_ITERATIONS="$OPTARG"
      ;;
    h)
      usage
      exit 0
      ;;
    :)
      print -u2 "option requires a value: -$OPTARG"
      usage
      exit 1
      ;;
    \?)
      print -u2 "unknown option: -$OPTARG"
      usage
      exit 1
      ;;
  esac
done

shift $((OPTIND - 1))

if (( $# != 0 )); then
  print -u2 "unexpected positional args: $*"
  usage
  exit 1
fi

if ! command -v codex >/dev/null 2>&1; then
  print -u2 "codex not found in PATH"
  exit 1
fi

SCRIPT_DIR=${0:a:h}
REPO_ROOT=${SCRIPT_DIR:h}

if [[ -z "$THREAD_ID" ]]; then
  print -u2 "thread_id required via -t"
  usage
  exit 1
fi

if [[ -z "$PROMPT_TEXT" ]]; then
  print -u2 "prompt required via -p"
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

mkdir -p "$RUN_DIR"

print "repo: $REPO_ROOT"
print "thread id: $THREAD_ID"
print "prompt: provided"
print "run dir: $RUN_DIR"
print "max iterations: $MAX_ITERATIONS"
print "sleep between iterations (seconds): $SLEEP_BETWEEN_ITERATIONS_SECONDS"
print "preview chars: $PREVIEW_CHAR_COUNT"

for ((iteration = 1; iteration <= MAX_ITERATIONS; iteration++)); do
  ITERATION_ID="$(printf "%03d" "$iteration")"
  EVENTS_FILE="$RUN_DIR/iteration-${ITERATION_ID}.events.jsonl"
  STDERR_FILE="$RUN_DIR/iteration-${ITERATION_ID}.stderr.log"
  LAST_MESSAGE_FILE="$RUN_DIR/iteration-${ITERATION_ID}.last-message.txt"

  print
  print "iteration $iteration/$MAX_ITERATIONS"
  print "events: $EVENTS_FILE"
  print "stderr: $STDERR_FILE"
  print "last message: $LAST_MESSAGE_FILE"

  if (
    cd "$REPO_ROOT"
    print -r -- "$PROMPT_TEXT" | FAMILY_1_ITERATION="$iteration" \
      codex exec resume \
        --dangerously-bypass-approvals-and-sandbox \
        --json \
        -o "$LAST_MESSAGE_FILE" \
        "$THREAD_ID" \
        - \
        >"$EVENTS_FILE" \
        2>"$STDERR_FILE"
  ); then
    rc=0
  else
    rc=$?
  fi

  print
  print "codex exit: $rc"

  if ! print_preview "codex output preview (last message):" "$LAST_MESSAGE_FILE"; then
    print_preview "codex output preview (events):" "$EVENTS_FILE" || true
  fi

  if (( rc != 0 )); then
    if [[ -s "$STDERR_FILE" ]]; then
      print -u2 "stderr:"
      sed -n '1,120p' "$STDERR_FILE" >&2
    fi
    print -u2 "loop stopped on codex failure"
    exit "$rc"
  fi

  if [[ -f "$LAST_MESSAGE_FILE" ]] && grep -Fq '<promise>COMPLETE</promise>' "$LAST_MESSAGE_FILE"; then
    print "completion sentinel found"
    exit 0
  fi

  if (( iteration < MAX_ITERATIONS )); then
    print "sleeping ${SLEEP_BETWEEN_ITERATIONS_SECONDS}s before next iteration"
    sleep "$SLEEP_BETWEEN_ITERATIONS_SECONDS"
  fi
done

print -u2 "iteration limit reached without completion sentinel"
exit 1
