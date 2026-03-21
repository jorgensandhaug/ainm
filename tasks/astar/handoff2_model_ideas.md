No one can know the literal optimum in advance, but given the task structure and your data regime, the **best current bet** is very clear:

**Use a small number of specialized models, not one giant model.**
Make the **teacher dynamics model moderately rich**, make the **round-regime latent very small**, make the **online student small and fast**, and keep the **summary / calibration / policy layers tiny**.

That recommendation comes from the basic asymmetry of the task: active rounds still have only 50 stochastic year-50 viewport queries across 5 seeds, the world runs for 50 yearly steps, the yearly mechanics are structured, and the score is entropy-weighted KL on the final tensor. Historical replay gives you lots of within-round trajectories, but only a few dozen independent round laws. So the right capacity should live in the shared dynamics, not in a huge per-round latent space. ([NM i AI][1])

Here is the model stack I would actually build, and how large each piece should be.

## 1. Static geometry pipeline

**Model type:** no learned model at first. Deterministic feature computation.

**What it does:** computes coast masks, mountain barriers, land/sea distances, mixed reachability, forest support, fjord and chokepoint features, nearest-settlement reachability, basin size, and similar geometry features.

**Optimal size:** zero trainable parameters.

**Why:** this is map geometry, not a pattern-recognition problem. Making it learned too early wastes sample efficiency and makes debugging harder.

**When to make it learned:** maybe later add a tiny learned geometry embedding, but only on top of deterministic features, never instead of them.

## 2. Replay event extractor

**Model type:** mostly deterministic rules, optionally tiny learned helper heads if some transitions are ambiguous.

**What it does:** turns replay transitions (X_t \to X_{t+1}) into supervised event labels:

* birth,
* collapse,
* portization,
* owner switch,
* rebuild,
* reclaim,
* mark deltas like (\Delta)population, (\Delta)food, (\Delta)wealth, (\Delta)defense.

**Optimal size:** zero trainable parameters initially; if needed, tiny helpers under 100k params.

**Why:** this is a measurement layer. You want it clean and inspectable.

## 3. Per-round effective summary models

This is the first place where real fitting should happen.

**Model type:** separate, per-round, regularized hazard / regression models.
Best starting point: **GAM/GLM/LightGBM-style summaries**, not neural networks.

For example:

* logistic hazard for collapse,
* logistic hazard for birth,
* logistic hazard for portization,
* multinomial head for owner switch,
* Gaussian / robust regression for continuous mark deltas.

**Optimal size:** very small.

Good default:

* 20–80 engineered input features per event,
* linear or GAM coefficients, or
* boosted trees with depth 3–5 and maybe 100–300 trees per event,
* or a tiny MLP with 2 layers of width 32–64 if necessary.

**Why this is optimal:**
These summaries are fit **independently per round**. Even with many replay paths inside a round, you do not want a high-capacity model here because the point of this layer is not ultimate accuracy; it is to produce stable, interpretable round fingerprints (\theta_r). A tiny regularized model is much better for that.

**Do not do:** per-round giant neural models. Total waste.

## 4. Cross-round regime manifold model

This is where you compress the per-round summaries into a low-dimensional latent regime.

**Model type:** weighted factor model, PPCA, factor analysis, or mixture-of-factor-analyzers.

Start simple:
[
\theta_r = \mu + \Lambda z_r + \epsilon_r.
]

Here:

* (\theta_r) = fitted summary vector for round (r),
* (\mu) = mean summary,
* (\Lambda) = loading matrix,
* (z_r) = latent regime coordinates.

**Optimal size:** extremely small.

My recommended starting range:

* continuous latent dimension (d = 4),
* maybe later test (d = 6) and (d = 8),
* optional discrete mixture with 2–4 archetypes if clustering clearly helps.

**What not to do:**
Do not start with (d=16), (32), or (64). With around 30 independent rounds, that is unjustified.

**Why:**
The effective sample size for this level is the number of rounds, not the number of replay paths. So this is the layer that must stay brutally parsimonious.

## 5. Teacher world model

This is the main model. It should be the richest part of the stack, but still not huge.

**Model type:** hierarchical grey-box stochastic state-space simulator with:

* a **local grid module**,
* a **settlement interaction graph module**,
* a **small hidden memory** only if Markov tests say it is needed,
* and **low-rank round modulation** via the regime latent.

This choice is strongly supported by the structure of the task. The system is a repeated dynamical process with interacting settlements and local geography. Deep Markov Models are the right general state-space framing for partially observed nonlinear dynamics, while Deep Sets and Graph Network Simulators are the right architectural inspirations for permutation-invariant query sets and interacting object/graph dynamics. ([arXiv][2])

### 5A. Local grid module

**Model type:** small U-Net-ish or residual CNN on the 40×40 grid.

**Optimal size:**

* 2–3 scales only,
* channels around 32 → 64 → 96,
* 2 residual blocks per scale max,
* total params for this part roughly 300k–1.5M.

This part handles:

* local terrain effects,
* nearby colonization pressure,
* ruin/reclaim/rebuild dynamics,
* local resource support.

### 5B. Settlement graph module

**Model type:** sparse graph neural network / message-passing network over active settlements.

**Optimal size:**

* node hidden dimension 64–128,
* edge hidden dimension 16–32,
* 2–3 message-passing steps,
* 2-layer MLPs with hidden width 64–128,
* total params for this part roughly 300k–2M.

This part handles:

* trade,
* raid-like interactions,
* owner competition,
* maritime interaction structure.

This is where graph-network simulators are the right inspiration: learned message passing over interacting entities is a much better inductive bias than flattening settlements into raw pixels. ([Proceedings of Machine Learning Research][3])

### 5C. Hidden memory

**Model type:** tiny latent memory per settlement or per world.

Use only if needed.

**Optimal size:**

* per-settlement hidden memory 8–16 dims,
* or tiny global memory 8–32 dims.

Why so small?
Because hidden state is only there to absorb unobserved internals like tech/longship if replay does not expose them. It should not become a giant free-form latent channel.

### 5D. Round modulation

**Model type:** FiLM / low-rank adapter / hypernetwork conditioning on (z_r).

**Optimal size:**

* latent (z_r): 4–8 continuous dims,
* adapter rank 4–8,
* maybe 2–4 discrete mixture components.

This is critical:
**round modulation must be tiny.**
The model should put capacity in shared dynamics, not in a rich regime manifold.

### 5E. Event heads

**Model type:** small MLP heads.

You want separate heads for:

* birth,
* collapse,
* portization,
* owner switch,
* rebuild/reclaim,
* continuous mark deltas.

**Optimal size:**

* 2 layers,
* width 64,
* maybe 128 at most.

### Teacher total size

**Optimal total parameter budget:**

* start around **1M–3M parameters**,
* only scale toward **5M–8M** if holdout results justify it,
* do **not** jump to 20M+.

Why this range?
Because you have plenty of transitions for the shared dynamics, but only a few dozen round laws. A 1M–3M model is large enough to express local and relational dynamics without becoming a memorization machine for the limited cross-round variation.

That is, in my judgment, the sweet spot.

## 6. Terminal decoder (F(M,z)\to P)

You need a fast final-tensor decoder for live use, even if the teacher can generate rollouts.

**Model type:** distilled terminal predictor conditioned on map + regime latent.

This can share some architecture ideas with the local grid module, but it is simpler than the teacher.

**Optimal size:**

* 0.5M–2M params,
* 2–3 convolutional scales,
* channels 32–64–96,
* optional small graph context injection.

**Why:**
Mapping ((M,z)) directly to the final tensor is easier than modeling all 50 steps. So this model can be smaller than the teacher.

**Do not make it huge.**
Its job is fast approximation of the teacher’s implied year-50 distribution.

## 7. Student posterior model (q(z\mid M,D))

This is the live-round inference model. It sees:

* initial maps,
* up to 50 live viewport results,
* settlement marks inside those viewports.

**Model type:** set-based posterior network.

Why set-based?
Because the query transcript is naturally an unordered set of observations, and Deep Sets is the canonical architecture for permutation-invariant functions on sets. ([arXiv][4])

### Recommended architecture

Use three parts:

1. **Patch encoder** for each query window.
2. **Settlement-set encoder** inside each query.
3. **Transcript aggregator** over the 50 queries.

### 7A. Patch encoder

**Model type:** tiny CNN.

**Optimal size:**

* 3–4 conv layers,
* channels 16–32–64,
* output embedding size 64–128.

### 7B. Settlement-set encoder

**Model type:** Deep Sets or tiny set transformer if needed.

**Optimal size:**

* item MLP 2×64,
* pooled embedding size 64–128.

### 7C. Transcript aggregator

**Model type:** Deep Sets first, Set Transformer only if needed.

**Optimal size:**

* pooled embedding size 128–256,
* posterior head outputs:

  * mean/cov for (z_r),
  * or mixture logits + Gaussian params.

### Student total size

**Optimal total parameter budget:**

* start around **300k–1M parameters**,
* maybe up to **1.5M–2M** if it clearly helps,
* but no more unless the teacher and synthetic episode generation are already excellent.

Why keep it small?
Because the live information budget is tiny. A huge student is more likely to overfit the historical rounds than to generalize to new ones.

## 8. Direct student predictor (Q(M,D)\to \hat P)

I would include this as an auxiliary model, not the main one.

**Model type:** direct query-to-tensor predictor.

**Optimal size:**

* 0.5M–2M.

This is useful as:

* a distillation target,
* a hedge,
* a fast deployment model.

But I would not trust it alone as the main system.

## 9. Query policy model

Initially, I would **not** fit a large learned policy model.

The best first query policy is **model-based and mostly unlearned**:

* use teacher uncertainty,
* use posterior sensitivity to (z),
* use predicted score weight (entropy-relevant regions),
* rank candidate windows greedily.

Only after the teacher/student are stable would I train a small learned acquisition scorer.

**Optimal initial policy model:** none, just analytic acquisition.

**If learned later:**

* contextual bandit or scoring network,
* under 100k–500k params.

That is enough. The policy does not need a transformer.

## 10. Calibration and ensemble layer

**Model type:** tiny.

Use:

* temperature scaling,
* Dirichlet-style calibration,
* convex stacking over 2–4 models.

**Optimal size:** negligible.

This layer should remain tiny and shallow.

## 11. What should be trained jointly?

This is where size interacts with training structure.

### Train separately / independently

* geometry preprocessing: no training.
* event extraction: mostly no training.
* per-round summary models: fit independently per round.
* cross-round factor model: fit on round summaries only.
* calibration/ensemble: fit last, separately.

### Train jointly

* teacher world model: yes, jointly across all replay trajectories and all rounds, but with tiny round modulation.
* terminal decoder: can be trained jointly with teacher or distilled from it.
* student posterior model: train jointly over synthetic live episodes, but **after** teacher exists.

### Do **not** try to train everything jointly from scratch

That is the wrong move here.
Stagewise training is better because each layer has a different effective sample size.

## 12. The actual “optimal sizes” summary

If you want the most concise answer possible, here it is.

**Geometry / event extraction:** deterministic, zero params.
**Per-round hazard summaries:** GLM/GAM/LightGBM or tiny MLPs, effectively tiny.
**Cross-round regime manifold:** 4–8 continuous dims, maybe 2–4 discrete modes.
**Teacher world model:** graph-cell hybrid, 1M–3M params to start, 5M–8M max if justified.
**Hidden memory:** 8–16 dims per settlement if needed.
**Terminal decoder:** 0.5M–2M params.
**Student posterior:** Deep Sets / set-based, 300k–1M params to start, 1.5M–2M max.
**Direct student predictor:** 0.5M–2M params.
**Query policy:** unlearned teacher-driven first, tiny learned scorer later if needed.
**Calibration / ensemble:** tiny.

That is the size profile I would actually implement.

## 13. The one sentence version

The optimal stack is:

**tiny summary models, tiny regime latent, medium-sized grey-box teacher, small student, tiny policy/calibration layers.**

If you want, I can next turn this into a concrete implementation blueprint with exact tensor shapes, module boundaries, and a recommended order of coding each model.

[1]: https://app.ainm.no/docs/astar-island/overview?utm_source=chatgpt.com "Astar Island — Viking Civilisation Prediction"
[2]: https://arxiv.org/pdf/1609.09869?utm_source=chatgpt.com "Structured Inference Networks for Nonlinear State Space ..."
[3]: https://proceedings.mlr.press/v119/sanchez-gonzalez20a.html?utm_source=chatgpt.com "Learning to Simulate Complex Physics with Graph Networks"
[4]: https://arxiv.org/abs/1703.06114?utm_source=chatgpt.com "[1703.06114] Deep Sets"

