# PLAN-0004 Classifier And Fusion Strategy

## Metadata

- id: `PLAN-0004`
- status: active
- date: `2026-03-20`
- scope: define the first technically-defensible shelf-crop classifier and fusion architecture after the first detector + retrieval baseline

## Why This Exists

We now know enough to stop speaking vaguely about "add a classifier".

The next recognizer cannot be designed in isolation.

It has to respect the actual data constraints:

- current best real local stack is `0.717616`
- same-box oracle is `0.817538`
- retrieval already has strong candidate quality on matched detector crops:
  - global top-1/top-5 `0.627225 / 0.825916`
  - supported/reference-like top-1/top-5 `0.658966 / 0.867712`
- but retrieval still fails structurally on:
  - `missing_reference`
  - `unknown_sentinel`
  - `sibling_variant_trap`

At the same time, a pure classifier also cannot be the whole answer.

## Hard Constraint: Retrieval Must Stay In The Stack

A closed-set shelf-crop classifier trained only on blocked-train GT crops cannot see every val class.

Val classes with zero train crops:

- `91` `SANDWICH PESTO 37G WASA`
- `256` `KAFFEFILTER PRESSKANNE 25STK EVERGOOD`
- `279` `KNEKKEBRØD NATURELL GL.FRI 240G WASA`
- `285` `Leka Egg 10stk`
- `350` `BLÅ JAVA HELE BØNNER 340G COTW`

Of those:

- `91`, `256`, `279`, `350` have packshots and are therefore still reachable by retrieval
- `285` is `missing_reference` and has no train crops, so it is structurally impossible for the first classifier and structurally weak for retrieval

Implication:

- classifier cannot replace retrieval
- retrieval must remain a first-class branch
- fusion must operate on the union of:
  - train-seen shelf classes
  - packshot-covered classes

## What The Classifier Should Actually Try To Solve

The classifier should not be framed as "fix only weird buckets".

It should solve two different problems at once:

1. structural recovery
- `missing_reference`
- `unknown_product`
- shelf-domain appearance
- low-view / weak-packshot classes

2. supported-class reranking
- improve retrieval mistakes on reference-safe classes
- especially low-margin detector crops
- especially dense `knekkebrod` and weak `egg`

Why this matters:

- biggest annotation mass still sits in reference-safe classes
- the largest recoverable score is not only in edge cases

## Recommended First Classifier

### Stage A: Frozen-Embedding Classifier First

First real classifier should be:

- `PE-Core` shelf-crop embeddings
- linear probe or shallow MLP classifier
- class-balanced objective
- calibrated probabilities

Why:

- cheapest defensible first step
- reuse the strongest current embedder
- low implementation risk
- easy to verify with tiny-overfit and shuffled-label controls
- easier to compare directly against retrieval than a large end-to-end model

Do not start with:

- a heavy end-to-end vision model
- a giant multiclass detector head
- OCR fusion

### Stage B: Train On Jittered GT Crops

Training data for the classifier should not be only clean GT crops.

It should include synthetic detector noise:

- random box expansion
- random box shrink
- x/y shifts
- mild truncation near edges
- context padding jitter

Reason:

- the classifier will be used on detector crops
- GT-only clean crops will overestimate downstream quality

### Stage C: Output Space

Classifier output should be:

- all train-seen category ids
- including `unknown_product`

Do not force it to "cover" categories with zero train support.

Those should remain retrieval-driven.

## Why Not A Pure 356-Way First Classifier

Train support is extremely long-tailed:

- `52` train classes have `<=2` crops
- `85` have `<=5`
- `122` have `<=10`
- `169` have `<=20`

So a naïve full-capacity 356-way model is likely to overfit noise first.

The first classifier should therefore be:

- simple
- strongly regularized
- verification-heavy

## Fusion Architecture Recommendation

The next real stack should not be "retrieval, else classifier".

That is too weak because:

- some impossible retrieval buckets are confidently wrong
- many supported classes still need reranking help

Best first fusion design:

1. detector score
2. retrieval score vector
3. classifier probability vector
4. optional soft theme prior

Then combine them with simple calibrated rules.

## Best First Fusion Rules To Test

### Rule 1. Retrieval Baseline

- retrieval only
- score-fused baseline:
  - `detector_score * retrieval_top1_score`

This is current baseline to beat:

- hybrid `0.717616`

### Rule 2. Margin-Aware Fusion

Use classifier more heavily when:

- retrieval margin is small
- retrieval bucket is structurally weak

But do not rely on margin alone.

### Rule 3. Category-Availability Routing

- if class has no retrieval support, classifier dominates
- if class has no classifier support, retrieval dominates
- if both exist, blend

This is the key structural rule.

### Rule 4. Soft Theme Prior

Theme should be a soft prior, not hard gating.

Why:

- image dominant-theme purity median is about `0.8585`
- `195 / 248` images are `>= 0.8` pure
- but some shelves are mixed

So theme prior can help, but must not zero out alternatives.

## Best Immediate Experiment Order

### EXP-0013A

Frozen `PE-Core` embedding + linear probe on jittered GT crops.

Must pass:

- tiny overfit control
- shuffled-label collapse
- real blocked train/val GT-crop eval

### EXP-0014A

Detector + retrieval + classifier fusion on blocked val.

Must compare:

- raw retrieval pipeline `0.693615`
- score-fused retrieval pipeline `0.717616`
- classifier-only on detector crops
- fused retrieval + classifier

### EXP-0014B

If promising:

- add better calibration
- add soft theme prior
- maybe add retrieval top-k rerank with classifier logits

Only then consider:

- stronger classifier backbone
- stronger detector family

## What Not To Do

- do not drop retrieval
- do not trust classifier-only full-slice score as the deployment answer
- do not use blocked val as a hyperparameter playground
- do not add OCR before classifier fusion is measured

## Decision

Freeze this:

1. retrieval remains mandatory
2. first classifier should be frozen-embedding and heavily verified
3. fusion is the next core modeling problem
4. the baseline to beat is `0.717616`, not `0.693615`
