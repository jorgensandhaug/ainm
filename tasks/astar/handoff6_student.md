The right way to think about (q) is:

**(q) is not the world model.**
It is the **inverse model** that reads the limited evidence available in a live round and returns a **posterior over the hidden round regime**.

More formally, if the live round gives you

* the 5 initial maps (M),
* and up to 50 stochastic year-50 viewport observations (D={(A_i,Y_i)}_{i=1}^n),

then the object you actually want is

[
p(z \mid M,D),
]

or, even better in the semimechanistic setting,

[
p(\theta \mid M,D),
]

where (\theta) is a small vector of round-specific simulator coefficients, and (z) is a low-dimensional factorization of (\theta). The active-round interface, yearly 50-step horizon, and score on the final probability tensor all come directly from the official task definition. ([app.ainm.no](https://app.ainm.no/docs/astar-island/overview?utm_source=chatgpt.com))

So the clean answer is:

* the **teacher** learns how worlds evolve;
* the **decoder** maps a round regime to final probability tensors;
* **(q)** learns how to infer that regime from the *same kind of partial evidence you get online*.

That is what (q) is.

---

# 1. The first correction: do not make (q) predict an arbitrary abstract latent if you can avoid it

The best version of (q) does **not** directly predict some meaningless free-floating vector (z).

The best version predicts a posterior over a **small semimechanistic round parameter vector** (\theta), or over a very small factorization of it.

This is the most important concrete upgrade from the earlier, more abstract formulation.

Because your EDA now strongly suggests that a lot of round variation is carried by a small set of actual coefficients, such as:

* food intercept,
* food mean reversion,
* population food cost,
* plains food bonus,
* forest food bonus,
* founding base rate,
* founding cycle amplitude,
* newborn food level,
* collapse baseline,
* maybe port gain scale,
* maybe conquest intensity,
* maybe rebuild propensity.

Call that vector (\theta_r \in \mathbb R^p) for round (r).

Then you can factor it as

[
\theta_r = \mu + L z_r + \varepsilon_r,
]

where:

* (\mu) is the global mean coefficient vector,
* (L) is a low-rank loading matrix,
* (z_r \in \mathbb R^d) is a tiny latent regime vector,
* (\varepsilon_r) is small residual noise.

This is already a much more concrete formulation.

So the best practice is:

1. **Teacher fits (\theta_r)** from full replay.
2. Optional: compress (\theta_r) to a tiny (z_r) with factor analysis / low-rank mixed effects.
3. **(q)** infers (\theta_r) or (z_r) from live evidence.

If you can infer (\theta_r) directly, that is often better than inferring an arbitrary latent.

---

# 2. What (q) should take as input

In the live round, (q) gets exactly the information the competition allows:

* the 5 initial maps (M={M_s}_{s=1}^5),
* and the query transcript
  [
  D = {(s_i, A_i, Y_i)}_{i=1}^n,
  ]
  where:
* (s_i) is the seed index,
* (A_i) is the viewport,
* (Y_i) is the observed year-50 patch plus settlement attributes in that patch.

The endpoint docs say each `/simulate` call returns a fresh stochastic run, only the requested viewport region of the year-50 grid, and settlement-level fields like population, food, wealth, defense, has_port, alive, and owner_id inside that viewport. ([app.ainm.no](https://app.ainm.no/docs/astar-island/endpoint?utm_source=chatgpt.com))

So (q) should use **exactly** those objects, and nothing more.

That means (q) must learn to infer the round regime from **terminal local evidence**:

* how much settlement mass is present,
* how many ruins,
* how many ports on coastal cells,
* what the population/food/defense distributions look like,
* how those compare to the initial map patch,
* and how these signatures vary across seeds and windows.

That is the inverse problem.

---

# 3. The best target for (q): posterior over round coefficients, not just a point estimate

The single most important design choice is that (q) should output a **distribution**, not just one number.

Because even with 50 live queries, the current round will remain partially uncertain.

So the best object is something like

[
q_\psi(\theta \mid M,D)
]

or, after factorization,

[
q_\psi(z \mid M,D).
]

In practice, I would use:

## Option A: mixture over regime archetypes + Gaussian residual

[
q_\psi(c,u \mid M,D)
====================

\text{Cat}(\pi_\psi(M,D)) \times \mathcal N(\mu_\psi(M,D), \Sigma_\psi(M,D)),
]
and then
[
\theta = \mu_c + L_c u.
]

This is my favorite option if the historical rounds clearly cluster into a few archetypes like:

* expansive,
* harsh/barren,
* moderate,
* conflict-heavy.

## Option B: low-dimensional Gaussian directly in coefficient factor space

[
q_\psi(z\mid M,D)=\mathcal N(\mu_\psi, \Sigma_\psi)
]
and
[
\theta = \mu + L z.
]

This is simpler and often enough if the regime manifold looks smooth.

## Option C: particle posterior over a prototype bank

Have a bank of historical regime particles ({\theta_k}), maybe plus local perturbations, and let (q) output weights. This is powerful if the true regime manifold is small and irregular.

---

# 4. How do we get the targets to train (q)?

This is the central question, and the answer is very concrete.

We train (q) **using historical rounds as supervised inverse-problem episodes**.

For each historical round (r), the teacher has much more information than the live system ever gets:

* many replay trajectories,
* full states through time,
* final tensors,
* and possibly a fitted round coefficient vector (\hat\theta_r) or posterior (p_T(\theta_r \mid \text{full replay}_r)).

So historical rounds give you exactly what you need:

* **inputs of the live kind**: synthetic query transcripts,
* **targets of the hidden kind**: regime coefficients or posterior from the teacher.

That is the whole trick.

## Concretely

For each historical round (r):

### Step 1: fit the teacher-side regime target

Using full replay for that round, fit:
[
\hat\theta_r \quad \text{or} \quad p_T(\theta_r \mid \text{full replay}_r).
]

This could come from:

* direct semimechanistic coefficient fitting,
* or from a hierarchical grey-box teacher.

### Step 2: create synthetic live episodes

Now censor the round down to what the online system would actually see.

Sample an episode:

* choose (n \in {1,\dots,50}),
* choose a query policy or query distribution,
* sample (n) viewport observations from historical year-50 replay outcomes,
* construct
  [
  D_e = {(s_i,A_i,Y_i)}_{i=1}^n.
  ]

Now you have a pair:
[
(M_r, D_e) \mapsto \hat\theta_r.
]

That is a supervised training example for (q).

Do this many times per historical round, with different:

* numbers of queries,
* query locations,
* amounts of repetition,
* and policies.

That is how (q) is trained.

This is why replay is so valuable: it turns online regime inference into a standard supervised meta-learning problem.

---

# 5. The best architecture for (q)

The best (q) is **not** a plain MLP over flattened observations.

It should have a two-level set structure.

Why?

Because live queries have two kinds of structure:

1. They come from **different windows**, possibly on different seeds.
2. The same window can be queried repeatedly, and those repeats are i.i.d. terminal samples under the same round law.

That means the most statistically natural architecture is:

## Level 1: per-observation encoder

For each individual query (i), build an embedding
[
e_i = h_\psi(M_{s_i}, A_i, Y_i),
]
where (h_\psi) sees:

* the initial local patch from (M_{s_i}),
* the viewport coordinates (A_i),
* the observed final grid patch,
* the settlement marks in the viewport,
* and derived local features.

This encoder should use both **raw tensors** and **structured summaries**.

### Raw patch tensor

Concatenate:

* initial patch one-hot terrain channels,
* final patch one-hot class channels,
* delta channels,
* coastal / terrain masks,
* maybe distance-to-initial-settlement channels.

### Settlement mark tensor / summaries

Overlay or summarize:

* population map,
* food map,
* defense map,
* wealth map,
* port mask,
* alive mask,
* owner partition features.

Plus summary stats:

* class counts,
* counts of ruins / ports / settlements,
* mean and histogram of food/pop/def,
* initial→final transition counts in the patch,
* proximity to initial settlements,
* coastal fraction,
* frontier score.

This should probably be a small CNN plus an MLP over summary features.

## Level 2: group repeated observations by window

For each unique window (w=(s,A)), gather all its repeated observations:
[
S_w = {e_i : (s_i,A_i)=w}.
]

Then encode the group with a permutation-invariant set operator:
[
g_w = \rho\big({e_i}_{i\in S_w}\big),
]
for example by using:

* mean,
* variance,
* count,
* Deep Sets,
* or a Set Transformer.

This is extremely important because repeated queries to the same window are not duplicates — they are empirical samples from the same patch law.

If you ignore this grouping, you waste one of the best statistical levers in the live round.

## Level 3: aggregate across windows and seeds

Now aggregate the window embeddings:
[
G = \Phi\big({g_w}_{w\in \mathcal W}\big),
]
with a transformer or another set encoder that can attend across:

* seeds,
* coastal vs inland windows,
* frontier vs deep interior windows,
* repeated vs singly observed windows.

This final global context (G) goes to the posterior head.

---

# 6. The best losses to train (q)

This is where a lot of implementations go wrong. The best (q) should **not** be trained with only one loss.

It should use three losses.

## Loss 1: posterior distillation to teacher posterior

If the teacher gives a posterior (p_T(\theta_r\mid \text{full replay}*r)), train (q) to match it:
[
L*{\text{distill}}
==================

\mathrm{KL}\big(
q_\psi(\theta\mid M_r,D_e)
;|;
p_T(\theta_r\mid \text{full replay}_r)
\big)
]
or a symmetric divergence.

This gives the right hidden target.

## Loss 2: decoded predictive loss on the actual competition object

Push samples from (q) through the decoder (F_\phi):
[
\hat P = \mathbb E_{\theta \sim q_\psi}[F_\phi(M_r,\theta)].
]

Then compare to the historical ground-truth tensor:
[
L_{\text{pred}}
===============

\mathcal L_{\text{score}}(P_r,\hat P),
]
where (\mathcal L_{\text{score}}) should match or approximate the competition score, i.e. entropy-weighted KL on the final tensor. The official scoring page defines exactly that structure. ([app.ainm.no](https://app.ainm.no/docs/astar-island/scoring?utm_source=chatgpt.com))

This loss is critical because (\theta)-space or (z)-space coordinates are somewhat arbitrary. What matters is whether the decoded final tensor is right.

## Loss 3: direct coefficient supervision

If you have a concrete semimechanistic coefficient vector (\hat\theta_r), add
[
L_{\text{coeff}} = |\mathbb E_q[\theta]-\hat\theta_r|^2
]
or NLL if probabilistic.

This stabilizes training and makes (q) more interpretable.

### Optional Loss 4: archetype classification

If you use regime families (c_r),
[
L_{\text{class}} = \text{CE}(\hat c, c_r).
]

### Optional Loss 5: anytime loss

Sample random truncations of the query set:

* 1 query,
* 5 queries,
* 10 queries,
* 20,
* 50.

Train (q) to work well at all budgets, not just at 50.

This is important because online the posterior should improve sequentially.

---

# 7. The single best practical version: (q) as a proposal, plus particle correction

If you want the strongest practical system, I do **not** think the best final posterior should come from (q) alone.

The best setup is:

## (q) = fast amortized proposal posterior

[
q_\psi(\theta \mid M,D)
]
gives you a good, fast approximation.

## Then refine with particles

Sample particles
[
\theta_k \sim q_\psi(\theta \mid M,D)
]
or from a mixture of (q) and a prototype bank.

Then reweight them using a learned patch likelihood or likelihood-ratio model:
[
w_k \propto \frac{p_\eta(D \mid M,\theta_k),p(\theta_k)}{q_\psi(\theta_k\mid M,D)}.
]

This is importance sampling / particle correction.

Why is this so good?

Because:

* (q) is fast and amortized.
* But (q) may be slightly biased.
* Particle correction lets you recover something closer to a true Bayesian posterior.

This hybrid is almost always stronger than:

* pure amortized inference,
* or pure likelihood-free search from scratch.

And because the regime dimension is small, particle refinement is actually feasible.

## How to get (p_\eta(D\mid M,\theta))

You do **not** need a perfect full-patch exact likelihood over raw observations.

A very good approximation is enough:

* a learned synthetic likelihood over grouped patch summary statistics,
* or a learned likelihood ratio model.

For each observed group of repeated windows, compare:

* empirical class frequencies,
* empirical settlement-stat histograms,
* port/ruin frequencies,
* and maybe a few local pattern summaries,

to the distribution generated by the teacher under (\theta).

This is especially powerful when the same window is repeated several times.

---

# 8. The exact online loop

Here is the best practical online algorithm.

## Before the round

You already have:

* teacher (F_\phi),
* prior (p(\theta)),
* amortized inference network (q_\psi),
* maybe a likelihood model (p_\eta) or ratio model,
* maybe a particle bank of historical regimes.

## During the live round

Initialize with the prior:
[
q_0(\theta)=p(\theta).
]

As each query arrives:

### Step A: update grouped query statistics

Store the new ((s,A,Y)) in the transcript.
If this window was already queried, update the repeated-window empirical stats.

### Step B: run (q_\psi)

Compute
[
q_\psi(\theta\mid M,D_{1:t}).
]

### Step C: particle refine

Draw particles from (q_\psi) (and maybe some from the prior or regime bank).
Reweight with patch likelihood / synthetic likelihood.
Resample if needed.

### Step D: decode to final tensor

Compute
[
\hat P_t
========

\sum_k w_k F_\phi(M,\theta_k).
]

This is the current best prediction.

### Step E: choose next query

Use the current posterior to choose the window that most reduces uncertainty in score-relevant cells.

That is the online loop.

---

# 9. Why this is the best way, not just a high-level way

This approach is best because it matches the actual information geometry of the task.

The live round gives you:

* tiny amount of data,
* all at year 50,
* local windows only,
* but on 5 seeds that share one regime.

So the right response is:

* push almost all complexity offline,
* keep the online unknown tiny,
* make (q) a specialized inverse model for that tiny unknown.

It is *not* best to:

* retrain anything online,
* infer a huge latent,
* or try to search teacher parameter space from scratch from 50 windows.

Also, because each `/simulate` call is a fresh stochastic run, the transcript is statistically a set of i.i.d. patch samples conditional on the regime and chosen windows. The endpoint docs state that directly. That is why the set-based posterior network + repeated-window grouping is mathematically natural here. ([app.ainm.no](https://app.ainm.no/docs/astar-island/endpoint?utm_source=chatgpt.com))

---

# 10. The sharpest final recommendation

If I were implementing this now, I would do this:

## Regime target

Do **not** train (q) on arbitrary latent (z) directly.

Instead:

1. fit a semimechanistic round coefficient vector (\theta_r),
2. factorize to a very small (z_r) only if needed,
3. train (q) to output posterior over (\theta) or ((c,u)) where (c) is a small archetype and (u) is a tiny continuous residual.

## Architecture

Use a **two-level set encoder**:

* per-query patch encoder,
* grouped repeated-window encoder,
* global set aggregator across windows and seeds.

## Training data

Generate huge numbers of **synthetic active-round episodes** from historical rounds:

* random query counts,
* random query locations,
* best-known policy queries,
* repeated windows,
* mixed strategies.

## Losses

Train with:

* teacher posterior distillation,
* final tensor predictive loss,
* direct coefficient loss,
* optional archetype loss,
* anytime query-budget loss.

## Online inference

Use (q) as the proposal posterior and add **particle correction**.

That is, in my judgment, the strongest real answer to “what exactly is (q), how do we train it, and how do we infer the regime online?”

The shortest possible definition is:

**(q) is a learned Bayesian inverse map from live year-50 patch evidence to a posterior over the small round-specific mechanics that govern the teacher simulator.**

If you want, the next step is that I write this as near-pseudocode and module-by-module implementation instructions for the actual system.

