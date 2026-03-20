# Astar Island Challenge Facts

> This is the canonical factual reference for the game/task itself.
> Exception to the normal `docs/` rule: this file is not supplementary.
> It exists to separate official NM i AI docs facts from richer replay facts observed from direct platform use.

## How To Use This Doc

- Treat `Officially Documented Facts` as the public contract unless the platform changes.
- Treat `Direct Platform Facts To Re-Verify` as project-accepted observations, not public-doc guarantees.
- If new code or docs depend on replay behavior beyond the public docs, verify it locally once, save example payloads, and keep the extractor reproducible.

## Operative Summary

Officially, Astar Island is a five-seed, 50-query, stochastic, probabilistic forecasting task over a 50-year Norse world simulator. You submit one `H x W x 6` probability tensor per seed and are scored by entropy-weighted KL against organizer Monte Carlo ground truth. In project practice, completed-round replay appears to expose much richer timestep-level stochastic data than the public endpoint docs describe.

## Officially Documented Facts

### Task Shape

- Platform: `app.ainm.no`
- API base: `https://api.ainm.no/astar-island`
- Task: predict the final per-cell probability distribution of terrain classes across the whole map after a 50-year black-box simulation
- Framing: observation + probabilistic prediction, not deterministic reconstruction of one exact future map

### Round Structure

- Each round has 5 seeds.
- Hidden behavioral parameters are shared across all 5 seeds within a round.
- The map seed determines the visible terrain layout for a seed.
- The map seed is visible.
- The sim seed changes for every simulation run.
- The `50`-query budget is shared across all 5 seeds.

| Term | Meaning |
| --- | --- |
| map seed | visible seed that determines the initial terrain layout |
| sim seed | stochastic seed used for one simulator run; changes every query |
| hidden parameters | latent behavior parameters shared across the round |
| query budget | `50` total `simulate` calls shared across the 5 seeds |

### World Representation And Terrain Classes

- World is a rectangular grid; default size is `40 x 40`.
- Internally the simulator uses 8 terrain codes.
- Scoring collapses those 8 codes into 6 prediction classes.
- Mountains never change.
- Forests are mostly static except they can reclaim ruined land.

| Internal Code | Meaning | Scored Class |
| --- | --- | --- |
| `10` | Ocean | `0` |
| `11` | Plains | `0` |
| `0` | Empty | `0` |
| `1` | Settlement | `1` |
| `2` | Port | `2` |
| `3` | Ruin | `3` |
| `4` | Forest | `4` |
| `5` | Mountain | `5` |

Prediction class order is fixed:

- `0`: Empty / Ocean / Plains
- `1`: Settlement
- `2`: Port
- `3`: Ruin
- `4`: Forest
- `5`: Mountain

### Map Generation

The docs describe map generation as procedural and built from:

- ocean borders
- fjords cut inland from edges
- mountain chains formed by random walks
- clustered forest patches
- initial settlements placed on land with spacing constraints

The docs explicitly say the visible map seed is enough to reconstruct the initial terrain layout locally from round details.

### Simulation Lifecycle

Each simulation runs for 50 yearly time steps. Official yearly phase order:

1. growth
2. conflict
3. trade
4. winter
5. environment

Phase summaries from the docs:

- Growth: settlements produce food from adjacent terrain, can grow population, may develop ports on coastlines, can build longships, and can found nearby settlements when prosperous.
- Conflict: settlements can raid one another; longships extend range; low-food settlements raid more aggressively; raids loot resources and damage defenders; conquered settlements can sometimes switch faction allegiance.
- Trade: ports within range can trade if not at war; this increases wealth and food and diffuses technology.
- Winter: settlements lose food; starvation, accumulated raid damage, or harsh winters can collapse settlements into ruins.
- Environment: thriving nearby settlements may reclaim ruins and rebuild them, including restoring coastal ruins as ports; otherwise ruins may be overtaken by forest or fade back to plains.

### Settlement State

Official docs say settlement state tracks at least:

- position
- population
- food
- wealth
- defense
- tech level
- port status
- longship ownership
- faction allegiance via `owner_id`

Initial round state does not expose all of that. Officially exposed at round start:

- settlement positions
- port status

Not exposed at round start:

- population
- food
- wealth
- defense
- other internal stats

### Active-Round Observation Surface

Auth:

- Team endpoints require either the `access_token` cookie or a Bearer token header.

Public/team endpoints documented in the official endpoint spec:

- `GET /astar-island/rounds`
  Lists rounds with timing and status.
- Round statuses: `pending`, `active`, `scoring`, `completed`
- `GET /astar-island/rounds/{round_id}`
  Returns round details plus initial states for all seeds, including the full initial grid and the initial settlement list for each seed.
- `GET /astar-island/budget`
  Returns the active-round query budget.
- `POST /astar-island/simulate`
  Runs one stochastic simulation and returns only a final-year viewport, not the full map.
- `POST /astar-island/submit`
  Submits one seed prediction tensor.
- `GET /astar-island/analysis/{round_id}/{seed_index}`
  Returns post-round ground truth comparison data.

`POST /astar-island/simulate` facts:

- viewport min size: `5 x 5`
- viewport max size: `15 x 15`
- each call uses a different random sim seed
- repeated calls therefore produce different stochastic outcomes
- response includes:
  - viewport grid only
  - settlements inside that viewport only
  - effective viewport bounds
  - full map width and height
  - updated budget counters

Documented settlement fields in `simulate` responses:

- `x`
- `y`
- `population`
- `food`
- `wealth`
- `defense`
- `has_port`
- `alive`
- `owner_id`

Budget and rate limit:

- `50` total queries per round across the 5 seeds
- `5` requests/second/team for `POST /simulate`
- exceeding rate limit or budget returns `429`

### Submission Contract

- Submit per seed via `POST /astar-island/submit`.
- Payload shape is `prediction[y][x][class]`, i.e. `H x W x 6`.
- Every cell must have 6 nonnegative probabilities.
- Each cell must sum to `1` within `+/- 0.01`.
- Resubmitting a seed overwrites the previous submission.
- Only the last submission for a seed counts.
- You need all 5 seeds for a complete round score.
- Missing submission for a seed scores `0`.

### Scoring And Leaderboard

- Organizers estimate the ground-truth `H x W x 6` tensor by running the simulator hundreds of times with the true hidden parameters.
- Score is based on entropy-weighted KL divergence between your prediction and that ground-truth tensor.
- Lower weighted KL is better.
- Seed score formula:

```text
score = max(0, min(100, 100 * exp(-3 * weighted_kl)))
```

- Cell weights are based on entropy, so near-deterministic static cells matter little and uncertain dynamic cells matter most.
- Assigning `0.0` probability to a class is dangerous because KL becomes infinite if truth has positive mass there.
- Official recommendation: use a small floor such as `0.01` and renormalize.
- Round score is the average of the 5 seed scores.
- Public leaderboard uses the best weighted round score, not a cumulative mean across all rounds.
- Round weights increase as `1.05 ^ round_number`.
- Later rounds count more.
- Leaderboard also shows a hot streak score over the last 3 rounds.

### Post-Round Analysis And Replay

- `GET /astar-island/analysis/{round_id}/{seed_index}` returns:
  - your submitted prediction
  - the official ground-truth tensor
  - the seed score
  - map size
  - initial grid
- The docs state that `ground_truth` is the actual `H x W x 6` probability distribution computed from Monte Carlo simulations.
- The public endpoint docs do not document a replay API endpoint.
- Separately, the site exposes a replay UI at `/submit/astar-island/replay`.
- That replay page lets a user select a completed round and seed and watch the simulation step by step with adjustable playback speed.

### Officially Documented Practical Workflow

The intended workflow in the docs is:

1. sign in
2. create or join a team
3. go to the Astar Island page
4. use the API during the active round
5. analyze results
6. submit predictions for all 5 seeds

## Direct Platform Facts To Re-Verify

These are not public-doc claims. They are project facts reported from direct platform use and should be verified once by any new contributor before code depends on them.

- Historical replay appears to support effectively unlimited stochastic reruns for completed rounds and completed seeds.
- Replay appears to expose the full map state at each timestep, not just the year-50 endpoint.
- Replay appears to expose the full settlement list at each timestep.
- Observed replay settlement fields include at least:
  - `x`
  - `y`
  - `population`
  - `food`
  - `wealth`
  - `defense`
  - `has_port`
  - `alive`
  - `owner_id`

Project hygiene rule:

- verify those replay capabilities locally once
- save example payloads
- pin a reproducible replay extractor
- only then build models that depend on them

## Source URLs

Official docs URLs from the project brief:

- Overview: <https://app.ainm.no/docs/astar-island/overview>
- Mechanics: <https://app.ainm.no/docs/astar-island/mechanics>
- Endpoint spec: <https://app.ainm.no/docs/astar-island/endpoint>
- Scoring: <https://app.ainm.no/docs/astar-island/scoring>
