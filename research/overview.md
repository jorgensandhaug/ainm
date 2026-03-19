# NM i AI 2026: High-Level Overview

Date: 2026-03-19

Scope here: the three non-Grocery-Bot tasks:

- `NorgesGruppen Data`
- `Tripletex`
- `Astar Island`

## One-line summary

- `NorgesGruppen Data`: offline object detection on grocery shelf images
- `Tripletex`: agentic accounting automation over a real API
- `Astar Island`: partial-observation world-modeling + probabilistic prediction

## Which tasks are actual ML tasks?

If "actual ML task" means classic prediction/modeling:

- `NorgesGruppen Data` is the most direct ML task. Train a detector/classifier on labeled images, submit inference code.
- `Astar Island` is also an ML/prediction task, but more unusual. It is probabilistic forecasting under partial observation with a hidden simulator.
- `Tripletex` is less "train a model" and more "build an agent/system" around an LLM, prompt parsing, API planning, validation, and error recovery.

## Task shape

## 1. NorgesGruppen Data

- Input: shelf images
- Output: product detections in COCO-style JSON
- Core skill: computer vision
- Score: `0.7 * detection_mAP + 0.3 * classification_mAP`
- Infra: uploaded `.zip`, offline sandbox, GPU available
- Main challenge: 357 product classes, limited package/runtime constraints, need both localization and product identity

## 2. Tripletex

- Input: multilingual accounting prompt, sometimes attached files
- Output: perform correct actions in a fresh Tripletex account, then return `{"status":"completed"}`
- Core skill: agent design, API orchestration, prompt parsing, validation
- Score: correctness by field checks, then tier multiplier, then efficiency bonus
- Infra: public HTTPS `/solve` endpoint required
- Main challenge: do the right sequence of API calls with few errors and minimal waste

## 3. Astar Island

- Input: limited simulator observations from a 40x40 world through a 5-15x15 viewport
- Output: full-map `H x W x 6` probability tensor per seed
- Core skill: probabilistic modeling, simulation inference, active information gathering
- Score: entropy-weighted KL divergence transformed to `0-100`
- Infra: authenticated REST API, 50 observation queries per round
- Main challenge: infer hidden dynamics from sparse stochastic rollouts and predict distributions, not single labels

## Practical prioritization

If goal is "highest leverage with standard ML tooling":

1. `NorgesGruppen Data`
2. `Astar Island`
3. `Tripletex`

If goal is "fastest path to a decent baseline":

1. `Tripletex` if you already have LLM infra + tool use
2. `Astar Island` with safe nonzero probabilistic baselines
3. `NorgesGruppen Data` with an off-the-shelf detector baseline

## Repo map

- [NorgesGruppen Data docs](/home/jorge/repos/ainm/research/norgesgruppen-data/README.md)
- [Tripletex docs](/home/jorge/repos/ainm/research/tripletex/README.md)
- [Astar Island docs](/home/jorge/repos/ainm/research/astar-island/README.md)
- [Tripletex API surface research](/home/jorge/repos/ainm/research/tripletex-api-surface.md)

## Source

Compiled from `ainm-docs` MCP resources on 2026-03-19.
