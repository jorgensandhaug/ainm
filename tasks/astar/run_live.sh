#!/bin/bash
# Run the best model on the current active live round and submit predictions.
# Usage: ./run_live.sh
#
# Model: ffam_ensemble_v31 (log-odds blending, LORO score 87.83)
# Components: ffam_mode_v248 (4-cluster, 3-seed MLP) + ffam_knn_v1 (5% adaptive blend)
# Policy: exploration_r3 (45 coverage + 3 diagnostic repeats = 48 queries)
#
# This script is SAFE to run multiple times on the same round — it will
# refuse to spend new queries if queries already exist, and resubmitting
# overwrites previous predictions.

set -euo pipefail
cd "$(dirname "$0")"

# Load API credentials
source .env

echo "=== Agent7 Live Submission ==="
echo "Model: ffam_ensemble_v31"
echo "Policy: exploration_r3"
echo ""

# Show current round info
BUDGET_JSON=$(curl -s -H "Authorization: Bearer $ASTAR_BEARER_TOKEN" "${ASTAR_BASE_URL}/budget")
ROUND_ID=$(echo "$BUDGET_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['round_id'])")
QUERIES_USED=$(echo "$BUDGET_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['queries_used'])")
QUERIES_MAX=$(echo "$BUDGET_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['queries_max'])")
echo "Round: $ROUND_ID"
echo "Budget: $QUERIES_USED/$QUERIES_MAX used"
echo ""

if [ "$QUERIES_USED" -gt 0 ]; then
    echo "Queries already spent. Using saved queries (budget=0)."
    uv run astar run-live-online \
        --model ffam_ensemble_v31 \
        --policy exploration_r3 \
        --samples-per-round 6 \
        --budget 0 \
        --submit-predictions \
        --round-id "$ROUND_ID"
else
    echo "Spending 48 queries and submitting predictions..."
    uv run astar run-live-online \
        --model ffam_ensemble_v31 \
        --policy exploration_r3 \
        --samples-per-round 6 \
        --budget 50 \
        --submit-predictions
fi

echo ""
echo "=== Done ==="
