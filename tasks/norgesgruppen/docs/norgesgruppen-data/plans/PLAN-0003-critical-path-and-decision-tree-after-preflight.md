# PLAN-0003 Critical Path And Decision Tree After Preflight

## Metadata

- id: `PLAN-0003`
- status: active
- date: `2026-03-20`
- scope: choose the shortest technically-defensible path from current preflight state to a real submission candidate

## Why This Exists

The project is no longer in vague planning.

We already know enough to stop treating every next experiment as equally useful.

Current state:

- dataset audit is strong
- evaluation is frozen enough to trust
- `PE-Core` is a strong GT-crop retriever
- public `DINOv3` is not the main path
- detector lane is live:
  - zero-shot `yolov8n` floor is weak
  - 10-epoch fine-tuned `YOLOv8n` reaches canonical class-agnostic `AP50 0.852028`
  - simple postprocess tuning does not beat the raw 1-epoch detector:
    - best small sweep only reached `AP50 0.668094`
    - it improved count noise and background FP rate, but not enough to change the decision tree
  - updated detector-box oracle-class bound is `0.879192` hybrid
  - perfect-box `PE-Core` bound is `0.860238` hybrid
  - so localization is no longer obviously the single largest remaining limiter
- first real detector + retrieval stack is now measured:
  - filtered detector-only operating point at `min_score 0.4` gives hybrid `0.557981`
  - detector + `PE-Core` gives hybrid `0.693615`
  - same-box oracle-class bound is `0.817538`
  - cheap score fusion `detector_score * retrieval_top1_score` already lifts hybrid to `0.717616`
  - matched true-positive detector crops give retrieval top-1/top-5 `0.627225 / 0.825916`
  - reference-like matched true-positive detector crops give `0.658966 / 0.867712`
  - so the next main bottleneck is post-detector recognition and calibration, not detector existence

What is still unknown is not "what models exist".

It is:

1. how much of the remaining problem is localization
2. how much is recognition on no-ref / sibling / unknown cases
3. which improvements are actually submission-compatible

This plan exists to force the next work to answer those questions in the fastest order.

## Current Best Working Hypothesis

The most likely winning system is not:

- a monolithic `356`-class detector

It is:

1. class-agnostic dense detector
2. `PE-Core` retrieval against the provided reference catalog
3. shelf-crop closed-set classifier as fallback / fusion path
4. unknown / abstain calibration
5. OCR/text rerank only if the remaining confusion is still concentrated in sibling SKUs and we can make deployment realistic

## Why The Architecture Needs Both Retrieval And A Closed-Set Crop Classifier

`PE-Core` already proved that catalog retrieval works well on reference-safe classes.

But retrieval alone has structural blind spots:

- `22` categories are in `missing_reference`
- `2` have ambiguous exact-name references
- `unknown_product` is a real sentinel class
- packshots and shelf crops have domain gap
- some classes have weak or low-view reference coverage

A shelf-crop classifier is the natural complement because it can learn:

- no-reference categories
- `unknown_product`
- shelf-domain appearance
- context not present in clean packshots

So the likely recognizer is not retrieval-or-classifier.

It is retrieval-plus-classifier, with calibration.

## Highest Information-Value Questions

These are the questions that most reduce wasted work:

### Q1. If localization were perfect, how good is current recognition really?

Need:

- oracle boxes + current best recognizer

Why:

- if this score is already strong, the main bottleneck is localization
- if this score is still mediocre, detector work alone will not save us

### Q2. Can a cheap submission-friendly detector localize densely enough?

Need:

- tiny-overfit sanity
- first real blocked-val `YOLOv8` class-agnostic baseline

Why:

- this question is now mostly answered for `YOLOv8n`
- the next role of detector work is incremental improvement, not existential validation

### Q3. How much of recognition failure is structural no-reference / sentinel behavior?

Need:

- closed-set GT-crop classifier baseline
- compare it against retrieval on full slice, missing-ref, and `unknown_product`

Why:

- if classifier fixes those buckets, fusion becomes the main recognition path
- if not, OCR or richer retrieval is more justified

### Q4. Are the remaining mistakes truly text-driven sibling confusions?

Need:

- focused error taxonomy after retrieval + classifier

Why:

- OCR should be earned, not assumed
- OCR is also the least deployment-friendly part of the stack right now

## Critical Path

Run in this order unless a hard gate fails.

### Step 1. Cheap Bounding Experiment: Oracle Boxes + `PE-Core`

Question:

- with perfect localization, what hybrid score and bucket profile does the current recognizer reach?

Use:

- blocked val GT boxes
- top-1 `PE-Core` predictions
- full image-level evaluator

Interpretation:

- high score -> localization first
- weak full-slice score but strong strict slice -> add closed-set crop classifier next
- weak even on strict-ish evaluable buckets -> recognition still underpowered

### Step 2. `EXP-0006` Tiny Overfit Sanity

Question:

- can the detector actually memorize a tiny subset?

Gate:

- if no, stop and fix training setup before any real detector comparison

### Step 3. `EXP-0006` Real Blocked-Val `YOLOv8n`

Question:

- what is the cheapest real localization baseline?

Read:

- `ap50_ignore_class`
- miss rate
- duplicate-box rate
- count `MAE`
- `egg`
- small boxes
- edge-touch boxes
- `problem_heavy` images

Decision:

- decent enough -> keep moving toward pipeline
- poor recall / poor count / severe bucket collapse -> move to `RF-DETR`

### Step 4. Cheap Bounding Experiment: Detector Boxes + Oracle Class Assignment

Question:

- if classification were perfect after detection, how far could the current detector carry the hybrid score?

Why:

- this isolates localization headroom after the first detector baseline exists

Interpretation:

- high oracle-class score with weak real pipeline -> recognition/calibration bottleneck
- low oracle-class score -> localization bottleneck

### Step 5. GT-Crop Closed-Set Classifier

Question:

- does a shelf-crop classifier solve the structural full-slice problems retrieval cannot?

Primary targets:

- missing-reference categories
- `unknown_product`
- exact-name ambiguous categories
- packshot-to-shelf domain gap

### Step 6. First Real Stack: Detector + `PE-Core`

Question:

- does simple decomposition already beat naive monolithic expectations?

Status:

- completed
- hybrid `0.693615` at the first realistic filtered detector point
- same-box oracle still `0.817538`, so raw retrieval is useful but not enough
- cheap score fusion already improves this to `0.717616`

### Step 7. Detector + Retrieval + Closed-Set Fallback

Question:

- do we now get the best of both worlds:
  - catalog matching where packshots are trustworthy
  - closed-set recovery where packshots are missing or weak

This is the most likely first serious submission candidate.

This is now the main next experiment track, alongside score calibration on the current retrieval stack.

### Step 8. OCR/Text Only If Error Taxonomy Demands It

Do this only if:

- remaining errors are still heavily concentrated in sibling-SKU confusions
- classifier fallback did not fix them enough
- we have a plausible submission-time OCR story

If OCR is still deployment-hostile, keep it in research track until proven necessary.

## Decision Tree

### Branch A. Oracle Boxes + `PE-Core` Is Already Strong

Meaning:

- recognition is not the near-term blocker

Do:

1. finish `EXP-0006`
2. if weak, run `EXP-0007`
3. build first stack
4. ship an early submission-friendly baseline quickly

Avoid:

- spending early cycles on OCR

### Branch B. Oracle Boxes + `PE-Core` Is Weak Mainly On Full Slice

Meaning:

- retrieval works where references are trustworthy, but structural no-ref / sentinel coverage is the blocker

Do:

1. train shelf-crop classifier
2. fuse retrieval + classifier
3. recalibrate unknown handling

Avoid:

- blaming the detector too early

### Branch C. `YOLOv8` Is Too Weak On Dense Localization

Meaning:

- submission-friendly baseline exists, but not enough quality

Do:

1. move to `RF-DETR`
2. test `SAHI` only after a baseline detector exists
3. use oracle-class upper bound to see whether the added detector complexity is worth it

Avoid:

- jumping straight to `Co-DETR` before cheaper practical baselines are understood

### Branch D. Retrieval + Classifier Still Leaves Sibling Families Messy

Meaning:

- remaining failure mass is genuinely text-heavy / flavor-size fine-grained

Do:

1. add OCR/text rerank
2. measure gains only on the hard buckets first
3. keep a separate submission-feasibility check

Avoid:

- turning OCR into mandatory stack complexity before it earns its keep

## Submission Track Must Stay Alive

Do not wait until the end to think about packaging.

The first real submission track should likely be:

1. class-agnostic detector
2. simple classification rule
   - retrieval only, or
   - detector-only with constant class as a floor, if needed
3. local `run.py` harness
4. latency and artifact-size checks

Reason:

- a decent early submission is strategically valuable
- competition feedback is limited, so offline rigor matters
- packaging surprises late in the project are avoidable

## What To Validate Before Trusting A Promotion

Every promoted method must clear all of these:

- primary blocked-val metric improved
- no hidden collapse in `egg`
- no hidden collapse in `problem_heavy`
- no hidden collapse in low-view / missing-ref / sibling buckets
- error review still makes qualitative sense
- runtime / weight story is still plausible for submission

If one of those fails, it is not a real promotion.

## Biggest Risks To Manage

### Overfitting The Single Dev Split

Mitigation:

- promote only after looking at bucket breakdowns
- run section-based shadow checks for any serious contender
- do not burn leaderboard submissions on barely-understood deltas

### Mistaking Retrieval Success For Full Recognition Success

Mitigation:

- always separate strict / extended / full slices
- always inspect no-ref / sentinel buckets

### Mistaking Detector AP For End-To-End Progress

Mitigation:

- run the cheap bounding experiments
- always inspect hybrid score, not just detector score

### Building An OCR Dependency We Cannot Ship

Mitigation:

- keep OCR conditional
- treat it as research-track until a submission-feasible implementation exists

## What Not To Do Next

- do not start `Co-DETR` first
- do not start `T-Rex2` first
- do not start pseudo-labeling first
- do not start monolithic `356`-class detection first
- do not assume OCR is mandatory before classifier fallback is tested

## Immediate Next Commands To Care About

Shortest path:

1. cheap oracle-box + `PE-Core` bound
2. `EXP-0006` overfit
3. `EXP-0006` real blocked-val run
4. detector-box + oracle-class bound
5. first detector + retrieval stack
6. score calibration on the first stack
7. closed-set GT-crop classifier baseline
8. detector + retrieval + classifier fallback

That sequence still maximizes information gained per unit of effort.
