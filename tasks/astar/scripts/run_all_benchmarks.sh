#!/bin/bash
# Run all benchmark configurations for the expanded 16-round dataset.
# Must run precompute_episodes.py first!
#
# Previous best models (8-round LOO):
#   1. CatBoost + exploration + obs-blend: 86.34
#   2. CatBoost + coverage + obs-blend: 85.38
#   3. CatBoost + coverage (no blend): 85.29
#   4. LGB v5_d8 + coverage (no blend): 84.94

export PATH="/home/jorge/.local/bin:$PATH"
export LD_LIBRARY_PATH="/nix/store/ihpdbhy4rfxaixiamyb588zfc3vj19al-gcc-15.2.0-lib/lib:/nix/store/xdxxfabbd8w0dadijsd8rkgvnhpn3rkf-zlib-1.3.1/lib"
cd /home/jorge/agent3/tasks/astar/scripts

echo "Starting all benchmarks at $(date)"

# Config 1: CatBoost + exploration + obs-blend (previous best: 86.34)
echo "=== Config 1: CatBoost + exploration + obs-blend ==="
uv run python3 agent3_catboost_v2.py \
  --name catboost_exploration_blend \
  --model-type catboost \
  --n-estimators 1500 \
  --max-depth 8 \
  --learning-rate 0.01 \
  --policy exploration \
  --blend-temperature 50.0 \
  --n-jobs-model 64 \
  2>&1 | tee ../data/artifacts/runs/catboost_exploration_blend_log.txt

# Config 2: CatBoost + coverage + obs-blend (previous: 85.38)
echo "=== Config 2: CatBoost + coverage + obs-blend ==="
uv run python3 agent3_catboost_v2.py \
  --name catboost_coverage_blend \
  --model-type catboost \
  --n-estimators 1500 \
  --max-depth 8 \
  --learning-rate 0.01 \
  --policy coverage \
  --blend-temperature 50.0 \
  --n-jobs-model 64 \
  2>&1 | tee ../data/artifacts/runs/catboost_coverage_blend_log.txt

# Config 3: CatBoost + coverage, no blend (previous: 85.29)
echo "=== Config 3: CatBoost + coverage, no blend ==="
uv run python3 agent3_catboost_v2.py \
  --name catboost_coverage_noblend \
  --model-type catboost \
  --n-estimators 1500 \
  --max-depth 8 \
  --learning-rate 0.01 \
  --policy coverage \
  --no-blend \
  --n-jobs-model 64 \
  2>&1 | tee ../data/artifacts/runs/catboost_coverage_noblend_log.txt

# Config 4: LGB v5_d8 + coverage, no blend (previous: 84.94)
echo "=== Config 4: LGB v5_d8 + coverage, no blend ==="
uv run python3 agent3_catboost_v2.py \
  --name lgb_v5d8_coverage_noblend \
  --model-type lgb \
  --n-estimators 800 \
  --max-depth 8 \
  --learning-rate 0.02 \
  --policy coverage \
  --no-blend \
  --n-jobs-model 64 \
  2>&1 | tee ../data/artifacts/runs/lgb_v5d8_coverage_noblend_log.txt

# Config 5: LGB v5_d8 + exploration + blend (new experiment)
echo "=== Config 5: LGB + exploration + blend ==="
uv run python3 agent3_catboost_v2.py \
  --name lgb_exploration_blend \
  --model-type lgb \
  --n-estimators 800 \
  --max-depth 8 \
  --learning-rate 0.02 \
  --policy exploration \
  --blend-temperature 50.0 \
  --n-jobs-model 64 \
  2>&1 | tee ../data/artifacts/runs/lgb_exploration_blend_log.txt

echo "All benchmarks complete at $(date)"
