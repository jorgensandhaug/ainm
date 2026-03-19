# Astar Island

Date: 2026-03-19

## What it is

A probabilistic prediction task over a hidden stochastic simulator.

You observe a Viking civilization simulator through small viewports, then submit a full-map probability tensor predicting final terrain/class outcomes after 50 simulated years.

## Core task

This is not standard supervised learning from a fixed labeled dataset.

It is closer to:

- active observation
- hidden-parameter inference
- world modeling
- probabilistic forecasting

You do not predict one label per cell. You predict a distribution over `6` classes for every cell.

## World and classes

Internal terrain codes map to `6` prediction classes:

| Internal | Terrain | Class |
|---|---|---|
| `10` | Ocean | `0` |
| `11` | Plains | `0` |
| `0` | Empty | `0` |
| `1` | Settlement | `1` |
| `2` | Port | `2` |
| `3` | Ruin | `3` |
| `4` | Forest | `4` |
| `5` | Mountain | `5` |

Class `0` merges Ocean, Plains, and Empty.

Static-ish:

- mountains never change
- forests mostly static

Dynamic/important:

- settlements
- ports
- ruins

## Competition structure

Each round:

- fixed map
- shared hidden parameters
- `5` seeds exposed to participants
- `50` total simulator queries per round
- max viewport `15x15`
- typical map `40x40`

Docs note: one endpoint page contains a conflicting reference to `15` seeds, but request tables and quickstart use `seed_index 0-4`. Treat `5` as current intended count unless the API proves otherwise.

## What you can observe

### Public round listing

`GET /astar-island/rounds`

Shows:

- round id
- status
- timing
- dimensions

### Round details

`GET /astar-island/rounds/{round_id}`

Gives initial states for all exposed seeds:

- full initial grid
- settlement positions
- whether each has port

Internal settlement stats are not exposed here.

### Simulation query

`POST /astar-island/simulate`

Request:

```json
{
  "round_id": "uuid",
  "seed_index": 0,
  "viewport_x": 10,
  "viewport_y": 5,
  "viewport_w": 15,
  "viewport_h": 15
}
```

Response gives only viewport region plus settlements inside it, with richer stats:

- `population`
- `food`
- `wealth`
- `defense`
- `has_port`
- `alive`
- `owner_id`

Each query consumes one budget unit.

Rate limit:

- max `5 req/sec`

## Hidden simulator dynamics

Each simulated year has phases:

1. growth
2. conflict
3. trade
4. winter
5. environment

Important qualitative mechanics:

- adjacent terrain affects food
- ports + longships increase range and trade/raid potential
- low-food settlements raid more aggressively
- settlements can switch faction
- ruins can be reclaimed
- forests can reclaim abandoned land

This means behavior depends on topology plus hidden parameters, not just local cell type.

## Submission format

Submit one prediction tensor per seed:

`POST /astar-island/submit`

```json
{
  "round_id": "uuid",
  "seed_index": 0,
  "prediction": [
    [[0.70, 0.10, 0.05, 0.05, 0.05, 0.05]]
  ]
}
```

Tensor shape:

- `prediction[y][x][class]`
- shape `H x W x 6`
- per-cell probabilities must sum to `1.0` within tolerance
- no negative values

Resubmitting same seed overwrites prior prediction.

If you do not submit all seeds, missing seeds score `0`.

## Scoring

Ground truth is built from many organizer-run simulations under true hidden parameters.

Per-cell comparison uses KL divergence:

```text
KL(p || q) = sum p_i * log(p_i / q_i)
```

Cells are entropy-weighted, so dynamic uncertain cells matter most.

Final score:

```text
weighted_kl = sum entropy(cell) * KL(ground_truth[cell], prediction[cell])
              -------------------------------------------------------------
                              sum entropy(cell)

score = max(0, min(100, 100 * exp(-3 * weighted_kl)))
```

Round score is average over all seeds.

Leaderboard score is weighted average over rounds.

## Critical scoring pitfall

Never put `0.0` probability on any class.

If ground truth has nonzero mass where your prediction has zero, KL blows up badly.

Safe pattern:

```python
prediction = np.maximum(prediction, 0.01)
prediction = prediction / prediction.sum(axis=-1, keepdims=True)
```

This is likely mandatory for any sane baseline.

## Authentication

Use either:

- `access_token` cookie
- `Authorization: Bearer <jwt>`

Base URL:

```text
https://api.ainm.no/astar-island
```

Docs examples also use `BASE = "https://api.ainm.no"` with paths appended.

## Good baseline strategy

### Baseline 0

Uniform distribution for every cell and every seed.

This is weak but valid, and docs say it still scores around `1-5`.

### Baseline 1

Deterministic terrain prior:

- mountains -> high class `5`
- forests -> high class `4`
- ocean/plains/empty -> high class `0`
- initial settlement cells -> mass over `1/2/3`

### Baseline 2

Heuristic world model using:

- coast proximity
- connectivity
- nearby forest/food potential
- raid/trade reach
- initial settlement density

### Baseline 3

Monte Carlo surrogate:

- infer hidden parameters from observations
- fit a simulator surrogate/emulator
- generate predicted distributions from repeated rollouts

## Information allocation problem

A huge part of this task is deciding where to spend the `50` queries.

You need tradeoffs across:

- seeds
- map regions
- exploration of uncertain zones
- repeated sampling of same viewport to estimate stochasticity

Good teams likely treat this as active learning / experiment design, not just prediction.

## Useful team endpoints

- `GET /astar-island/budget`
- `GET /astar-island/my-rounds`
- `GET /astar-island/my-predictions/{round_id}`
- `GET /astar-island/analysis/{round_id}/{seed_index}`

The analysis endpoint is especially useful after rounds because it exposes your prediction and the ground truth distribution.

## Best first implementation

If optimizing for a fast credible baseline:

1. fetch active round + initial states
2. build a safe nonzero prior tensor
3. preserve static terrain confidently but not with hard zeros
4. use a few queries on high-dynamics regions
5. submit all `5` seeds every round
6. inspect post-round analysis to improve the model

## Source

Compiled from `ainm-docs` MCP resources:

- `challenge://astar-island/overview`
- `challenge://astar-island/mechanics`
- `challenge://astar-island/endpoint`
- `challenge://astar-island/scoring`
- `challenge://astar-island/quickstart`
