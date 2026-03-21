The best dynamics model is **not** a plain Markov chain over grid cells, and it is also **not** a giant generic sequence model.

The best fit is:

**a hierarchical, partially observed, stochastic Markov state-space model with a grey-box transition kernel, where the state is a hybrid of grid state + settlement state + small hidden memory, and where round-to-round variation enters through a very small latent regime.**

That is the most precise answer I can give.

The official rules imply exactly that kind of structure: the world evolves for 50 yearly steps; each round has 5 seeds that share one hidden behavioral law; the yearly logic is structured into growth, conflict, trade, winter, and environment; settlements have rich state such as population, food, wealth, defense, port status, faction allegiance, and internally also tech/longship state; and the active-round interface gives only 50 stochastic year-50 viewport observations. That combination screams “state-space model with hidden regime,” not “flat supervised predictor.”

## 1. Is it Markov?

At the right level, yes.

At the wrong level, no.

If you define the state as only “terrain class at each cell,” then no, that is nowhere near Markov. The next year depends on settlement marks, ownership, ports, and probably hidden tech/longship state too. If you define the state as

[
X_t = (G,; C_t,; S_t,; H_t),
]

where (G) is static geometry, (C_t) is dynamic site state, (S_t) is the settlement table, and (H_t) is small hidden memory for whatever replay does not expose, then modeling the yearly evolution as

[
X_{t+1} \sim K_{\phi,z_r}(X_t,\xi_t)
]

is exactly the right abstraction. That is a **Markov state-space model**: Markov once the state is rich enough, partially observed if some latent memory remains hidden. Deep Markov Models are a standard nonlinear neural generalization of exactly this idea. ([arXiv][1])

So the right answer is:

* **not** a simple observable Markov chain,
* **yes** to a **partially observed Markov state-space model**,
* and in practice a **grey-box** one, not a fully generic one.

## 2. Why not a simpler Markov model?

A plain cell-level Markov model would assume something like

[
C_{t+1}(u) \sim p(\cdot \mid C_t(\text{local neighborhood of }u)).
]

That is too weak because the rules imply long-range and object-level interactions:

* ports create maritime edges,
* conflict and trade happen between settlements,
* ownership matters,
* hidden tech/longship state matters,
* winter may induce common shocks across many settlements,
* ruins can be rebuilt depending on nearby thriving settlements.

Those are not local site-only updates. So a pure cellular Markov model is underpowered.

## 3. Why not a giant transformer / generic world model?

Because your data are asymmetrical.

You may have around 5,000 trajectories, which gives roughly 250,000 yearly transitions, so there is plenty of data for learning **shared within-round dynamics**. But you only have maybe around 30 independent round laws. That means the part of the model that varies from round to round must stay tiny. A giant generic model can easily memorize those 30 round identities rather than learn a compact family of laws.

So the statistically right model is a **mixed-effects** or **hierarchical** state-space model:

* one rich shared transition kernel,
* one tiny round-specific random effect / latent regime. Mixed-effects state-space models are specifically designed for repeated dynamic data within groups plus structured between-group variation. ([PMC][2])

That is why I keep insisting on:
**rich shared dynamics, tiny regime latent.**

## 4. What is the actual best model class?

The best-fit class is:

### A hierarchical grey-box stochastic simulator with three layers

First, a **static geometry substrate**:

* deterministic map features,
* land/sea distances,
* coast/fjord/basin/chokepoint structure.

Second, a **hybrid dynamic state**:

* cell/site classes,
* settlement marks,
* owner structure,
* optional hidden memory.

Third, a **small round regime latent** (z_r):

* shared across the 5 seeds in a round,
* inferred online from live queries,
* learned offline from historical replay.

That gives:

[
X_{t+1}\sim K_{\phi,z_r}(X_t,\xi_t),
\qquad
P_{r,s}=F_{\phi,z_r}(M_{r,s}),
\qquad
q_\psi(z_r\mid M_r,D_r).
]

That is the right overall factorization.

## 5. What should the transition kernel look like?

The best kernel is **not monolithic**. It should be structured.

The mechanics suggest the yearly process decomposes into growth, conflict, trade, winter, and environment, even if replay probably only shows the year-boundary states. So the model should reflect that structure:

[
K_{\phi,z}
==========

K^{env}*{\phi,z_e}
\circ
K^{winter}*{\phi,z_w}
\circ
K^{trade}*{\phi,z_t}
\circ
K^{conflict}*{\phi,z_c}
\circ
K^{growth}_{\phi,z_g}.
]

This should be treated as an inductive bias, not as a claim that we directly observe each sub-phase. But it is still the correct bias because the documented mechanics are explicitly structured that way.

Inside that yearly kernel, the best architecture is a **cell + graph hybrid**:

* a **local grid module** for local support, reclaim, neighborhood growth, ruin behavior;
* a **settlement interaction graph module** for trade, raids, faction pressure, and maritime connectivity.

Graph Network Simulators are the closest general modeling template for the interaction side: represent dynamic entities as nodes and compute learned message-passing updates. That is a much better fit than trying to flatten everything into image convolutions. ([Proceedings of Machine Learning Research][3])

## 6. Why grey-box rather than fully hand-coded or fully black-box?

Because you know too much to justify a black box, but not enough to justify a white box.

You know:

* ports are coastal,
* mountains are impassable,
* forests matter locally,
* maritime reach matters,
* settlement marks matter,
* yearly phases have structure,
* the score only cares about the terminal probability tensor.

But you do **not** know:

* the literal growth formula,
* the literal conflict / trade rules,
* the literal winter distribution,
* the literal role of hidden tech/longship if not exposed,
* the exact randomization scheme.

So the sweet spot is grey-box:

* hand-specify state structure and transition factorization,
* learn the actual conditional maps.

That is the strongest bias-variance compromise.

## 7. The most promising concrete parameterization

If I had to tell an implementation agent exactly what to build first, I would say:

### Teacher = event-based stochastic graph-cell simulator

At each year, predict:

* site births,
* settlement collapse,
* portization,
* owner switches,
* ruin transitions,
* continuous settlement mark deltas.

Concretely:

[
\Pr(\text{birth at site }u \mid X_t,z_r)
========================================

1-\exp{-\lambda^{birth}*\phi(f*{u,t},z_r)}
]

[
\Pr(\text{collapse of settlement }i \mid X_t,z_r)
=================================================

\sigma(g^{collapse}*\phi(f*{i,t},z_r))
]

[
\Pr(\text{owner switch of }i \to k \mid X_t,z_r)
================================================

\text{softmax}*k(g^{owner}*\phi(f_{i,k,t},z_r))
]

[
\Delta m_{i,t}
==============

g^{marks}*\phi(f*{i,t},\text{messages},z_r)+\epsilon_{i,t}
]

where (f_{u,t}) and (f_{i,t}) are rich local/graph features.

This is the right form because replay gives you direct supervision for many of these transitions, even though trade/raid events themselves may remain latent. So you exploit replay where it is strongest: on observable state change.

## 8. What about the hidden round law?

This is where most of the statistical difficulty sits.

The correct round-level representation is **small**. Very small.

Not because the world is simple, but because the number of independent rounds is small. So the best regime representation is probably:

* maybe 2–4 **discrete archetypes**,
* plus 2–6 **continuous latent coordinates**,
* total effective dimension maybe around **4–8**.

The cleanest model is something like

[
z_r = (m_r, u_r),
]

where (m_r) is a small discrete regime type and (u_r) is a low-dimensional continuous vector.

You should not start by hand-defining those coordinates as “winter,” “trade,” “conflict,” etc. Instead, discover them from per-round replay summaries, then use them to modulate the teacher. This is where factor-analysis style decomposition of per-round summaries is useful.

## 9. So what is the optimal size?

Here is my best size recommendation.

### Static geometry + event extraction

No trainable parameters, or effectively none.

### Per-round summary models

Tiny.

Use:

* GLM/GAM/LightGBM,
* or very small MLPs with width 32–64 if needed.

These are not where you want to spend capacity.

### Regime manifold

Tiny.

Start with:

* (d = 4) continuous dimensions,
* maybe test (d = 6) and (d = 8),
* maybe 2–4 discrete mixture components if cross-round clustering is obvious.

Do not start bigger.

### Teacher local grid module

Small-to-medium.

Roughly:

* 2–3 resolution levels,
* channels around 32 → 64 → 96,
* 2 residual blocks per level.

That is maybe a few hundred thousand to around 1M parameters.

### Teacher settlement graph module

Medium.

Roughly:

* node hidden size 64–128,
* edge hidden size 16–32,
* 2–3 message-passing steps,
* 2-layer MLPs.

That is maybe another few hundred thousand to 1–2M parameters.

### Hidden memory

Tiny.

If needed:

* 8–16 dims per settlement,
* maybe 8–32 global dims for yearly shock.

### Total teacher

Start around **1M–3M parameters**.

Only push toward **5M–8M** if held-out round performance keeps improving.

I would be very skeptical of anything much larger unless you have extraordinary evidence.

### Terminal decoder (F(M,z)\to P)

Smaller than the teacher.

Around **0.5M–2M** parameters is plenty.

### Student posterior model (q(z\mid M,D))

Small.

Set-based model:

* patch encoder 64–128 dim output,
* settlement-set encoder 64–128 dim,
* transcript embedding 128–256 dim,
* total around **300k–1M** params to start.

Maybe up to **1.5M–2M** max if justified.

Deep Sets is the right default inductive bias for unordered query transcripts; upgrade to a Set Transformer only if the simpler model clearly saturates. ([arXiv][4])

### Query policy

Initially no learned model. Use teacher-driven analytic acquisition.

If learned later:

* tiny scorer, maybe **<100k–300k** params.

### Calibration / ensemble

Tiny and shallow.

## 10. What should be trained jointly and what should not?

This matters as much as model type.

You should **not** jointly train the whole system from scratch.

The right decomposition is:

* deterministic / nearly deterministic preprocessing for geometry and event extraction;
* separate per-round fitting for effective summaries;
* cross-round low-rank fitting for the regime manifold;
* joint training of the teacher across all replay trajectories;
* separate downstream training of the student on synthetic live episodes;
* final query policy and calibration on top of stable teacher/student models.

So the “optimal model type” is really a **stack**, not one net.

## 11. If I compress the whole answer

If you ask me for the single best sentence:

**Model the world as a partially observed stochastic Markov process on a hybrid grid-plus-settlement graph, with a rich shared transition kernel, a tiny mixed-effects round latent, and a small set-based student for online posterior inference.**

That is the best fit to:

* the official rules,
* the replay richness,
* the active-round observation bottleneck,
* and the data geometry of many trajectories but few independent rounds. ([PMC][2])

If you want, I can next turn this into a very concrete module-by-module architecture spec with exact tensor shapes, message-passing structure, and recommended loss functions for each head.

[1]: https://arxiv.org/pdf/1609.09869?utm_source=chatgpt.com "Structured Inference Networks for Nonlinear State Space ..."
[2]: https://pmc.ncbi.nlm.nih.gov/articles/PMC3507995/?utm_source=chatgpt.com "Mixed-Effects State Space Models for Analysis of Longitudinal ..."
[3]: https://proceedings.mlr.press/v119/sanchez-gonzalez20a.html?utm_source=chatgpt.com "Learning to Simulate Complex Physics with Graph Networks"
[4]: https://arxiv.org/abs/1703.06114?utm_source=chatgpt.com "Deep Sets"

