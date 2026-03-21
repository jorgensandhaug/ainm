#!/usr/bin/env bash

set -euo pipefail

script_dir=$(
  CDPATH= cd -- "$(dirname -- "$0")" && pwd
)
astar_root=$(
  CDPATH= cd -- "$script_dir/.." && pwd
)

output_path=${1:-"$astar_root/all_agent_progress.md"}
output_dir=$(dirname -- "$output_path")

top_root=$(git -C "$astar_root" rev-parse --show-toplevel)
prefix=$(git -C "$astar_root" rev-parse --show-prefix)
timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

mkdir -p -- "$output_dir"

mapfile -t worktrees < <(git -C "$astar_root" worktree list --porcelain | sed -n 's/^worktree //p')

progress_files=()
for worktree_root in "${worktrees[@]}"; do
  task_dir="$worktree_root"
  if [[ -n "$prefix" ]]; then
    task_dir="${worktree_root%/}/${prefix%/}"
  fi
  [[ -d "$task_dir" ]] || continue

  shopt -s nullglob
  matches=("$task_dir"/PROGRESS_AGENT*.md)
  shopt -u nullglob

  for match in "${matches[@]}"; do
    progress_files+=("$match")
  done
done

if ((${#progress_files[@]} > 0)); then
  mapfile -t progress_files < <(printf '%s\n' "${progress_files[@]}" | sort)
fi

{
  printf '# Agent Progress Snapshot\n\n'
  printf 'Generated: `%s`\n' "$timestamp"
  printf 'Repo top-level: `%s`\n' "$top_root"
  printf 'Task prefix: `%s`\n' "${prefix:-.}"
  printf 'Files found: `%d`\n' "${#progress_files[@]}"

  if ((${#progress_files[@]} == 0)); then
    printf '\nNo `PROGRESS_AGENT*.md` files found.\n'
  else
    for progress_file in "${progress_files[@]}"; do
      printf '\n---\n\n'
      printf '## `%s`\n\n' "$progress_file"
      cat -- "$progress_file"
      printf '\n'
    done
  fi
} >"$output_path"

printf 'Wrote %s with %d files\n' "$output_path" "${#progress_files[@]}"
