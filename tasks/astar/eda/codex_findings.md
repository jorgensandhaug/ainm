# Codex Replay EDA Findings

Source run:
- `uv run astar replay-eda`
- machine summary: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/replay_eda/summary.json`
- long report: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/replay_eda/report.md`

## Corpus

- `9` replay-backed rounds
- `46` seed dirs w/ replays
- `7313` real multi-frame replay runs
- `1` skipped single-frame replay
- `585,040,000` cell-year transitions
- `9,492,038` changed cell-years
- global changed-cell-year rate: `1.6225%`

Interpretation:
- world mostly static at cell-year level
- but dynamic cells matter a lot: many buildable sites change at least once across reruns

## Hard invariants verified

- mountains perfectly stable in corpus
  - mountain breaks: `0`
  - mountain births: `0`
- ocean perfectly stable in corpus
  - ocean changes out: `0`
  - ocean changes in: `0`
- ports appear coastal-only in corpus
  - inland port gains: `0`

So current replay evidence strongly supports:
- mountains never move
- ocean never changes
- ports require coast

## Dominant world lifecycle

Largest transition types:

1. `settlement -> ruin`: `2,894,600` (`30.50%` of all changes)
2. `plains -> settlement`: `1,731,671` (`18.24%`)
3. `ruin -> settlement`: `1,606,339` (`16.92%`)
4. `ruin -> plains`: `1,204,440` (`12.69%`)
5. `forest -> settlement`: `657,153` (`6.92%`)
6. `ruin -> forest`: `565,925` (`5.96%`)
7. `plains -> ruin`: `402,749` (`4.24%`)
8. `forest -> ruin`: `152,583` (`1.61%`)
9. `settlement -> port`: `134,131` (`1.41%`)
10. `port -> ruin`: `99,782` (`1.05%`)
11. `ruin -> port`: `42,665` (`0.45%`)

Interpretation:
- dominant loop is settle, collapse, rebuild, or clear
- ruins are central intermediate state
- forest participates actively, not just as static background
- port dynamics are real but much smaller than settlement/ruin churn

## Rates by initial terrain

Initial `ocean`:
- ever changed: `0.00%`
- cell-year change: `0.00%`

Initial `mountain`:
- ever changed: `0.00%`
- cell-year change: `0.00%`

Initial `plains`:
- ever changed: `25.99%`
- cell-year change: `1.73%`
- ever build: `21.71%`
- ever ruin: `18.80%`
- ever port: `1.51%`

Initial `forest`:
- ever changed: `27.07%`
- cell-year change: `1.80%`
- ever build: `22.62%`
- ever ruin: `19.58%`
- ever port: `1.45%`

Initial `settlement`:
- ever changed: `95.45%`
- cell-year change: `6.44%`
- ever build: `16.22%`
- ever ruin: `95.38%`
- ever port: `1.47%`

Initial `port`:
- ever changed: `96.55%`
- cell-year change: `6.53%`
- ever build: `14.74%`
- ever ruin: `96.55%`
- ever port: `27.82%`

Interpretation:
- plains and forest are both viable future settlement zones
- initial forest slightly more dynamic than initial plains
- initial settlements and ports are almost guaranteed to churn/collapse at least once across replay reruns

## Core spatial findings

Across all buildable cells:
- ever changed: `28.65%`
- ever build: `21.75%`
- ever ruin: `21.63%`
- ever port: `1.53%`

### Coast vs inland

Coastal buildable:
- ever changed: `21.52%`
- ever build: `16.72%`
- ever port: `8.57%`

Inland buildable:
- ever changed: `30.20%`
- ever build: `22.84%`
- ever port: `0.00%`

Interpretation:
- coast is specialized, not broadly more dynamic
- inland changes more overall
- coastal cells matter specifically for ports, not generic expansion

### Mountain adjacency

Mountain-adjacent buildable:
- ever changed: `28.42%`
- ever ruin: `22.42%`
- ever build: `21.26%`

Non-mountain-adjacent buildable:
- ever changed: `28.67%`
- ever ruin: `21.57%`
- ever build: `21.78%`

Interpretation:
- mountains do not strongly drive total site dynamism
- maybe tiny positive association w/ ruin risk, but weak
- likely not first-order explanatory feature alone

### Distance from map edge

Edge bucket `1`:
- ever changed: `18.53%`
- ever build: `15.60%`
- ever ruin: `11.43%`

Edge bucket `2`:
- ever changed: `27.22%`
- ever build: `20.19%`
- ever ruin: `19.27%`

Edge bucket `3+`:
- ever changed: `30.11%`
- ever build: `22.72%`
- ever ruin: `23.22%`

Interpretation:
- deeper interior substantially more dynamic than near-edge cells
- edge penalty seems real for both expansion and collapse

## Feature gradients

### Settlement proximity is huge

`settlement_proximity` lowest bin `[0.0, 0.2)`:
- ever changed: `6.99%`
- ever build: `5.92%`
- ever ruin: `4.02%`

highest bin `[0.8, 1.0)`:
- ever changed: `38.64%`
- ever build: `27.83%`
- ever ruin: `30.46%`

Interpretation:
- proximity to initial settlements is strongest simple geometric predictor found
- this likely should dominate any first hazard/prior model

### Frontier score matters a lot

`frontier_score` bin `[0.2, 0.4)`:
- ever changed: `41.08%`
- ever build: `25.44%`
- ever ruin: `32.09%`
- ever port: `5.33%`

Higher frontier bins are less dynamic:
- top bin `[0.8,1.0)` ever changed only `25.14%`

Interpretation:
- intermediate frontier zones look most volatile
- not monotone "more frontier => more change"
- there may be a sweet spot between saturation and isolation

### Coastal exposure nuanced

Low/mid coastal exposure bins:
- ever changed around `30.2%` to `30.6%`
- ever port `0%`

Highest coastal exposure bin `[0.8,1.0)`:
- ever changed `26.85%`
- ever build `20.47%`
- ever ruin `19.40%`
- ever port `3.13%`

Interpretation:
- very coastal cells less dynamic overall
- but that is where port option mass lives
- suggests coast trades off generic churn for maritime specialization

### Forest density

Low forest-density bin:
- ever changed `28.11%`

Highest forest-density bin:
- ever changed `32.37%`
- ever build `26.74%`
- ever ruin `23.55%`

Interpretation:
- denser forest neighborhoods somewhat more dynamic
- could reflect reclaim/rebuild frontier zones
- effect exists, but much weaker than settlement proximity

### Mountain density

Near-zero mountain density:
- ever changed `28.66%`

Higher mountain-density bins:
- `28.70%`, `26.71%`, `19.15%`

Interpretation:
- mountain density mostly weak or negative
- confirms mountains mostly constrain, not create, dynamic hotspots

## Temporal dynamics

Replay dynamics strongly accelerate over time.

Average by phase bucket:
- first 10 years: changed cells/run `10.78`, build/run `3.00`, ruin/run `4.06`, collapse/run `3.11`
- middle years 20-29: changed cells/run `24.13`, build/run `6.14`, ruin/run `8.89`, collapse/run `7.53`
- last 10 years: changed cells/run `43.14`, build/run `9.57`, ruin/run `16.58`, collapse/run `14.60`

Interpretation:
- late game much more turbulent than early game
- system seems to compound, not settle
- collapse pressure rises faster than build

### Most dynamic years

Top changed-cells/run years:
- step `47`: `50.67`
- step `48`: `47.03`
- step `43`: `46.82`
- step `49`: `46.05`
- step `39`: `43.49`

Top build years:
- step `47`: `15.22`
- step `43`: `14.89`
- step `11`: `14.75`
- step `35`: `14.48`
- step `39`: `14.36`

Top collapse years:
- step `48`: ruin/run `18.39`, collapse/run `16.37`
- step `49`: ruin/run `17.82`, collapse/run `16.07`
- step `47`: ruin/run `18.39`, collapse/run `15.25`
- step `44`: ruin/run `16.89`, collapse/run `14.98`
- step `46`: ruin/run `16.39`, collapse/run `14.83`

Interpretation:
- strongest shock cluster is late: roughly years `43-49`
- but build spike at `11` suggests an earlier expansion pulse too
- late years combine expansion, collapse, and rebuild simultaneously

## Settlement-state findings

Food buckets observed:
- only `[0,20)` ever appears in replay corpus
- exposure count there: `38,491,867`
- collapse rate from that bucket: `7.79%`
- owner-flip rate: `0.38%`
- no exposures seen in `<0`, `20-100`, `>=100`

Interpretation:
- either replay food values are tightly clipped/scaled or world usually lives in narrow food band
- this itself is suspicious, worth checking directly
- food as currently exposed may have less usable range than expected

## Round-level heterogeneity

Most dynamic rounds by changed-cell-year rate:

1. round `#6` `ae78003a-4efe-425a-881a-d16a39bca0ad`
   - changed-cell-year rate `3.27%`
   - build/run `711.11`
   - ruin/run `955.28`

2. round `#2` `76909e29-f664-4b2f-b16b-61b7507277e9`
   - rate `2.15%`
   - build/run `495.21`
   - ruin/run `613.49`

3. round `#9` `2a341ace-0f57-4309-9b89-e59fe0f09179`
   - rate `1.92%`
   - build/run `342.71`
   - ruin/run `598.07`

Most static round:
- round `#3` `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
- changed-cell-year rate `0.43%`
- build/run `15.33`
- ruin/run `165.93`
- but collapse per 100 live still high: `14.66`

Interpretation:
- round latent regime variation huge
- some rounds are massive expansion/collapse churn worlds
- others mostly decay
- likely worth explicit regime clustering/inference

## High-confidence conclusions

- mountains static
- ocean static
- ports coastal-only
- ruins central to world dynamics
- settlement proximity strongest simple spatial predictor
- interior more dynamic than edge
- coast less dynamic overall, but uniquely important for ports
- mountain adjacency weak explanatory signal
- late game much more chaotic than early game
- round-to-round latent regime variation very large

## Weird / notable things

- zero inland port gains across whole corpus
- zero observed negative-food or high-food buckets in replay settlement data
- initial forests are nearly as expansion-prone as plains, maybe more
- one of strongest frontier bins is intermediate, not extreme
- some rounds have giant build/run counts, others almost none

## What to investigate next

1. Simple hazard models
- predict `build`, `ruin`, `collapse`, `port_gain`
- start w/ geometry only
- then add previous-year settlement state

2. Residual spatial maps
- control for settlement proximity, coast, edge distance, forest density, mountain density
- ask: where is change still too high / low

3. Replay-vs-analysis calibration
- compare replay terminal marginals to official `analysis` tensors
- find where replay sample support undercovers truth

4. Local contagion
- does nearby ruin/collapse/owner-flip predict next-year local shock

5. Round clustering
- cluster rounds by step curves + transition mix
- likely regimes: expansion-heavy, collapse-heavy, maritime-heavy, reclamation-heavy

6. Replay settlement stat semantics
- verify whether food values are clipped/scaled
- check whether wealth/defense/pop also have narrow effective support
