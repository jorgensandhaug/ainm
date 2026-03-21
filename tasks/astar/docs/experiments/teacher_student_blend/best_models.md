# Best Models

No post-pivot full-family winner is promoted yet.

Current finished corrected-holdout ranking:

- `teacher_student_blend_v59`: mean score `65.4649`, mean weighted KL `0.141802`
- `teacher_student_blend_v60`: mean score `65.4188`, mean weighted KL `0.142051`
- `teacher_student_blend_v69`: mean score `65.4438`, mean weighted KL `0.141927`
- `teacher_student_blend_v67`: mean score `65.3996`, mean weighted KL `0.142170`
- `teacher_student_blend_v70`: mean score `65.3980`, mean weighted KL `0.142176`
- `teacher_student_blend_v68`: mean score `65.3540`, mean weighted KL `0.142420`
- `teacher_student_blend_v51`: mean score `65.0719`, mean weighted KL `0.143762`
- `teacher_student_blend_v52`: mean score `65.0268`, mean weighted KL `0.144004`
- `teacher_student_blend_v61`: mean score `64.5530`, mean weighted KL `0.146440`
- `teacher_student_blend_v62`: mean score `64.5082`, mean weighted KL `0.146682`
- `teacher_student_blend_v63`: mean score `63.9776`, mean weighted KL `0.149871`
- `teacher_student_blend_v64`: mean score `63.9308`, mean weighted KL `0.150145`
- `teacher_student_blend_v65`: mean score `52.7031`, mean weighted KL `0.219189`
- `teacher_student_blend_v66`: mean score `52.6574`, mean weighted KL `0.219560`
- `teacher_student_blend_v45`: mean score `61.3370`, mean weighted KL `0.163687`
- `teacher_student_blend_v13`: mean score `61.3244`, mean weighted KL `0.163762`
- `teacher_student_blend_v43`: mean score `61.3197`, mean weighted KL `0.163789`
- `teacher_student_blend_v35`: mean score `61.3164`, mean weighted KL `0.163808`
- `teacher_student_blend_v46`: mean score `61.2813`, mean weighted KL `0.164013`
- `teacher_student_blend_v15`: mean score `61.2680`, mean weighted KL `0.164093`
- `teacher_student_blend_v44`: mean score `61.2635`, mean weighted KL `0.164118`
- `teacher_student_blend_v37`: mean score `61.2600`, mean weighted KL `0.164138`
- `teacher_student_blend_v14`: mean score `59.9971`, mean weighted KL `0.170906`
- `teacher_student_blend_v36`: mean score `59.9978`, mean weighted KL `0.170902`
- `teacher_student_blend_v31`: mean score `59.9922`, mean weighted KL `0.171838`
- `teacher_student_blend_v38`: mean score `59.9185`, mean weighted KL `0.171371`
- `teacher_student_blend_v16`: mean score `59.9179`, mean weighted KL `0.171375`
- `teacher_student_blend_v33`: mean score `59.8833`, mean weighted KL `0.172501`
- `teacher_student_blend_v32`: mean score `58.9782`, mean weighted KL `0.178274`
- `teacher_student_blend_v34`: mean score `58.7956`, mean weighted KL `0.179503`

Current read:

- strongest finished branch is now the `k=1` line plus exact observed-cell posterior correction
- `v59` is the new corrected-gate leader and `v60` is essentially tied behind it
- the exact-local-evidence win kept moving in the same direction: lower shrinkage beat `v51/v52` again
- pushing the same beta schedule further down (`v63/v64`) was still decent but clearly worse than `v59/v60`
- making the posterior almost count-dominated (`v65/v66`) collapsed badly
- count-adaptive exact local evidence (`v67-v70`) came back almost neutral; `v69` was close but still did not beat `v59`
- next branch is seed-adaptive student mixing without the confidence gate, because the remaining error should mainly be unobserved-cell blending
- `v59` beats `v45` by `+4.1279` score and `-0.021885` KL
- residual-distance shrink is nearly neutral: `v35` / `v37` tied the leaders but did not beat them
- lowering `k` helped slightly on both backbones: `v43/v45` beat `v13`, `v44/v46` beat `v15`
- exact local evidence on the strong `k=1` line improved both held-out rounds sharply
- adding seed-adaptive/confidence gating to that line failed immediately (`v55/v56` fell to about `57.24`)
- multiscale temporal summaries lost on both global and spatial-dynamic backbones
- geometry-gated / class-weighted local blur branch also lost badly (`v25/v27/v28`)

Active queue now includes:

- `teacher_student_blend_v51`
- `teacher_student_blend_v52`
- `teacher_student_blend_v53`
- `teacher_student_blend_v54`
- `teacher_student_blend_v57`
- `teacher_student_blend_v58`
- `teacher_student_blend_v59`
- `teacher_student_blend_v60`
- `teacher_student_blend_v61`
- `teacher_student_blend_v62`
- `teacher_student_blend_v63`
- `teacher_student_blend_v64`
- `teacher_student_blend_v65`
- `teacher_student_blend_v66`
- full LOO live: `teacher_student_blend_v51`
- full LOO live: `teacher_student_blend_v52`
- full LOO live: `teacher_student_blend_v59`
- full LOO live: `teacher_student_blend_v60`
- next promotion target is `teacher_student_blend_v59`
- newest corrected-gate branches are `teacher_student_blend_v71` through `teacher_student_blend_v78`

Pending corrected-gate results:

- `teacher_student_blend_v71`
- `teacher_student_blend_v72`
- `teacher_student_blend_v73`
- `teacher_student_blend_v74`
- `teacher_student_blend_v75`
- `teacher_student_blend_v76`
- `teacher_student_blend_v77`
- `teacher_student_blend_v78`

Use [PROGRESS_AGENT3.md](/home/jorge/agent3/tasks/astar/PROGRESS_AGENT3.md) for the timestamped ledger and artifact paths.
