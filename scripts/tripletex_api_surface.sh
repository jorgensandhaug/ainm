#!/usr/bin/env bash

set -euo pipefail

out_dir="${1:-research/tripletex}"
prod_spec_url="https://tripletex.no/v2/openapi.json"
test_spec_url="https://api-test.tripletex.tech/v2/openapi.json"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

prod_spec="$tmp_dir/prod-openapi.json"
test_spec="$tmp_dir/test-openapi.json"

curl -fsSL "$prod_spec_url" -o "$prod_spec"
curl -fsSL "$test_spec_url" -o "$test_spec"

mkdir -p "$out_dir"

jq \
  --arg fetched_at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  --arg prod_spec_url "$prod_spec_url" \
  --arg test_spec_url "$test_spec_url" \
  --slurpfile test_spec "$test_spec" \
  '{
    fetchedAtUtc: $fetched_at,
    prodSpecUrl: $prod_spec_url,
    testSpecUrl: $test_spec_url,
    version: .info.version,
    title: .info.title,
    pathCount: (.paths | length),
    operationCount: ([.paths[] | to_entries[]] | length),
    methodCounts: (
      [.paths[] | to_entries[] | .key]
      | group_by(.)
      | map({method: .[0], count: length})
    ),
    operationTagCount: ([.paths[] | to_entries[].value.tags[]?] | unique | length),
    schemaCount: (.components.schemas | length),
    actionPathCount: ([.paths | keys[] | select(test("/:"))] | length),
    deprecatedOperations: (
      [.paths | to_entries[] | .key as $path | .value | to_entries[]
      | select((.value.deprecated // false) == true)
      | {method: .key, path: $path, operationId: (.value.operationId // ""), summary: (.value.summary // "")}]
    ),
    prodAndTestPathsEqual: ($test_spec[0].paths == .paths),
    prodAndTestSchemasEqual: ($test_spec[0].components.schemas == .components.schemas),
    prodServerUrl: .servers[0].url,
    testServerUrl: $test_spec[0].servers[0].url
  }' \
  "$prod_spec" > "$out_dir/summary.json"

jq -r '
  [
    .paths
    | to_entries[]
    | .key as $path
    | .value
    | to_entries[]
    | {
        method: .key,
        path: $path,
        tags: (.value.tags // []),
        operationId: (.value.operationId // ""),
        deprecated: (.value.deprecated // false),
        summary: ((.value.summary // "") | gsub("[\t\r\n]"; " "))
      }
  ]
  | sort_by(.path, .method)
  | (["method", "path", "tags", "operationId", "deprecated", "summary"] | @tsv),
    (.[] | [.method, .path, (.tags | join(",")), .operationId, (.deprecated | tostring), .summary] | @tsv)
' "$prod_spec" > "$out_dir/operations.tsv"

jq -r '
  [
    .paths
    | to_entries[]
    | .value
    | to_entries[]
    | .value.tags[]?
  ]
  | group_by(.)
  | map({tag: .[0], operationCount: length})
  | sort_by(-.operationCount, .tag)
  | (["tag", "operationCount"] | @tsv),
    (.[] | [.tag, (.operationCount | tostring)] | @tsv)
' "$prod_spec" > "$out_dir/tags.tsv"

jq -r '
  [
    .paths
    | to_entries[]
    | .key as $path
    | .value
    | to_entries[]
    | select((.value.deprecated // false) == true)
    | {
        method: .key,
        path: $path,
        operationId: (.value.operationId // ""),
        summary: ((.value.summary // "") | gsub("[\t\r\n]"; " "))
      }
  ]
  | sort_by(.path, .method)
  | (["method", "path", "operationId", "summary"] | @tsv),
    (.[] | [.method, .path, .operationId, .summary] | @tsv)
' "$prod_spec" > "$out_dir/deprecated.tsv"

printf 'wrote %s\n' "$out_dir/summary.json"
printf 'wrote %s\n' "$out_dir/operations.tsv"
printf 'wrote %s\n' "$out_dir/tags.tsv"
printf 'wrote %s\n' "$out_dir/deprecated.tsv"
