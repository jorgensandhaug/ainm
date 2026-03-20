# Agent Handoff — Generic Iteration / Benchmark / Repo Protocol

This document contains the reusable instructions that should apply to any agent iterating on any Astar-family model branch inside the existing framework.

## Mission

Your job is to improve historical benchmark performance and generalization on held-out rounds without sacrificing code quality, reproducibility, or iteration speed. You are operating inside an existing framework that already has data loading, offline training, query-policy plumbing, online inference hooks, and historical benchmark execution.

You must behave like a research engineer, not like a one-shot coder. You must:

1. read the local facts document first,
2. understand the current code before changing it,
3. make changes that are benchmarkable and replicable by model name,
4. track every experiment rigorously,
5. commit and push frequently,
6. keep code fast, clean, and consistent with the repo’s existing patterns,
7. never stop after one improvement; continue exhausting the design space of the assigned model family.

## Mandatory first actions

1. Read `docs/game_facts.md` in full before touching code.
2. Inspect the current implementation for:
   - model registration / discovery,
   - config loading,
   - training entrypoints,
   - benchmark outputs,
   - query-policy hooks,
   - artifact / checkpoint / metrics storage.
3. Run a no-change baseline historical benchmark with at least one already-existing model to confirm the environment works.
4. Identify where model names are declared and how the framework resolves them.
5. Create or extend a dedicated experiment ledger for this family before starting real work.

If `docs/game_facts.md` disagrees with code behavior or observed replay data, document the discrepancy explicitly and resolve it empirically instead of hand-waving.

## Non-negotiable engineering rules

### Reproducibility

Every model variant must have a **unique model name** and must be reproducible from that name alone via:

```bash
uv run astar run-historical-benchmark --model <MODEL_NAME>
```

There must be no hidden “current default” behavior, no mutable implicit config, and no dependence on manual notebook state.

A model name must freeze enough of the implementation/configuration that the exact score can be re-run later.

### Experiment tracking

Maintain a machine-readable experiment ledger, e.g. JSONL / CSV / SQLite / YAML, with at least:

- timestamp,
- model name,
- git commit SHA,
- branch name,
- family name,
- short hypothesis tag,
- train/holdout split description,
- benchmark aggregate score,
- per-round scores if available,
- per-seed scores if available,
- runtime,
- notes on what changed,
- whether this run is current best for the family,
- artifact/checkpoint paths.

Do not trust memory. Do not rely on commit messages alone.

### Git discipline

Commit frequently. Push frequently.

At minimum:
- commit after every meaningful model addition,
- commit after every benchmark that establishes a new best result,
- commit after every substantial refactor that changes the hypothesis space,
- push every such commit to the remote branch.

Commit messages should be specific and searchable. Example:

- `greybox: add event extraction + round-summary PCA`
- `greybox: add common-year shock latent to teacher`
- `greybox: student uses set-transformer transcript encoder`
- `greybox: benchmark gbx_evt_graph_z6_shock_v03 new best +1.7`

### Performance

Code must be written for high iteration speed.

That means:
- vectorize hot paths,
- precompute expensive static geometry features,
- cache derived datasets where appropriate,
- avoid Python loops over cells/settlements in training hot paths,
- profile data loading and model forward passes,
- avoid giant abstractions that slow every experiment,
- keep benchmark-time inference efficient.

If an implementation is “correct but slow,” it is not done.

### Scope control

Do not rewrite the entire framework unless absolutely necessary.

Prefer:
- minimal invasive changes,
- configuration-driven model variants,
- reusable utilities,
- incremental model subclasses / modules,
- narrow ablations that answer one question at a time.

### Scientific discipline

Every meaningful change must be attached to an explicit hypothesis.

Bad:
- “try another architecture.”

Good:
- “test whether adding a shared year-level common shock improves calibration of synchronized collapse events.”
- “test whether low-rank round modulation beats per-round free parameters under leave-one-round-out.”
- “test whether transcript order invariance matters by comparing RNN vs Set Transformer student.”

## Standard experiment loop

Use this loop repeatedly.

1. **State the hypothesis.**
   - What do you think is true?
   - Why should it matter for score?
   - What metric / benchmark outcome would support or reject it?

2. **Implement the smallest decisive test.**
   - Prefer minimal ablations over giant branches.
   - Instrument the model so failure modes are diagnosable.

3. **Run historical benchmark(s).**
   - Use the framework’s benchmark command.
   - Prefer holdout-by-round, never random path splits when the round law is what matters.

4. **Analyze failures.**
   - Where does score improve?
   - Where does it worsen?
   - Are gains isolated to certain round types?
   - Is calibration better or just sharper?
   - Did runtime get unacceptable?

5. **Log everything.**
   - ledger entry,
   - updated family notes,
   - best model table,
   - known-open questions.

6. **Commit and push.**

7. **Iterate.**
   - Either deepen the same branch or kill it and move to the next hypothesis.

## Required evaluation discipline

### Holdout structure

Because rounds have shared within-round law, evaluation must be grouped by round.

Preferred evaluation:
- leave-one-round-out,
- rolling chronological holdouts,
- repeated train/holdout partitions where whole rounds are held out.

Avoid any split that lets trajectories from the same round appear in both train and validation when testing generalization to unseen rounds.

### Metrics to log

Always log more than the benchmark score.

Track:
- benchmark aggregate score,
- per-round score variance,
- worst held-out round score,
- calibration metrics on final tensors if available,
- runtime / throughput,
- query-policy efficiency metrics if applicable,
- model size / parameter count (approximate is fine),
- training time.

### Baselines

Never drop baseline comparisons. Maintain a table with at least:
- current best official family model,
- previous best in this family,
- simplest valid baseline in this family,
- ablation without newest feature.

## Required documentation artifacts

Maintain or create the following inside the repo (adapt names to repo conventions if needed):

- `docs/experiments/<family>/README.md`
- `docs/experiments/<family>/hypotheses.md`
- `docs/experiments/<family>/best_models.md`
- `docs/experiments/<family>/open_questions.md`
- `artifacts/experiments/<family>/...` or repo-equivalent storage

If the repo already has equivalents, extend them instead of duplicating.

## Model naming protocol

Every model must be a separate named entity. Use stable, readable names.

Recommended pattern:

```text
<family>_<core>_<latent>_<memory>_<graph>_<student>_<policy>_vNN
```

Examples:
- `gbx_evt_z4_mem0_graph0_student0_policy0_v01`
- `gbx_evt_z4_mem0_graph1_student0_policy0_v02`
- `gbx_evt_z6_mem1_graph1_student1_policy0_v03`
- `gbx_evt_z6_mem1_graph1_student1_policy2_v07`

Rules:
- increment version when behavior changes,
- never silently mutate an existing model name,
- if behavior changes materially, create a new name,
- keep short aliases documented.

## Resourcefulness expectations

You are expected to be resourceful.

That means:
- read existing code to understand hidden utilities,
- reuse existing benchmark and training hooks instead of building parallel pipelines,
- profile before assuming where bottlenecks are,
- create tiny helper scripts only when they clearly accelerate the main loop,
- derive additional diagnostics from already available data instead of guessing.

## Stop condition

There is no lazy stop condition like “good enough after one improvement.”

You stop only when the assigned model family has been thoroughly explored and the marginal expected value of obvious remaining variants becomes low relative to time. Until then, continue iterating.

When in doubt, prefer one more sharply-defined ablation over hand-wavy theorizing.

## Final checklist for each meaningful iteration

Before moving on, confirm all of the following:

- [ ] The hypothesis is written down.
- [ ] The implementation is benchmarkable by unique model name.
- [ ] The benchmark ran successfully.
- [ ] Results are logged in the experiment ledger.
- [ ] Artifacts/checkpoints are stored predictably.
- [ ] A commit was created.
- [ ] The commit was pushed.
- [ ] Open questions / next actions were updated.

