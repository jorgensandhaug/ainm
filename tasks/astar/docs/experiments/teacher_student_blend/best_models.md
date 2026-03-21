# Best Models

No post-pivot full-family winner is promoted yet.

Current finished corrected-holdout ranking:

- `teacher_student_blend_v51`: mean score `65.0719`, mean weighted KL `0.143762`
- `teacher_student_blend_v52`: mean score `65.0268`, mean weighted KL `0.144004`
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
- `v51` is the new corrected-gate leader and `v52` is essentially tied behind it
- the jump is large, not marginal: `v51` beats `v45` by `+3.7349` score and `-0.019925` KL
- residual-distance shrink is nearly neutral: `v35` / `v37` tied the leaders but did not beat them
- lowering `k` helped slightly on both backbones: `v43/v45` beat `v13`, `v44/v46` beat `v15`
- exact local evidence on the strong `k=1` line improved both held-out rounds sharply
- multiscale temporal summaries lost on both global and spatial-dynamic backbones
- geometry-gated / class-weighted local blur branch also lost badly (`v25/v27/v28`)

Active queue now includes:

- `teacher_student_blend_v21`
- `teacher_student_blend_v22`
- `teacher_student_blend_v23`
- `teacher_student_blend_v24`
- `teacher_student_blend_v26`
- `teacher_student_blend_v39`
- `teacher_student_blend_v40`
- `teacher_student_blend_v41`
- `teacher_student_blend_v42`
- `teacher_student_blend_v47`
- `teacher_student_blend_v48`
- `teacher_student_blend_v49`
- `teacher_student_blend_v50`
- `teacher_student_blend_v51`
- `teacher_student_blend_v52`
- `teacher_student_blend_v53`
- `teacher_student_blend_v54`
- full LOO live: `teacher_student_blend_v13`
- full LOO live: `teacher_student_blend_v15`
- full LOO live: `teacher_student_blend_v45`
- full LOO live: `teacher_student_blend_v51`
- full LOO live: `teacher_student_blend_v52`
- next promotion target is `teacher_student_blend_v51`
- newest corrected-gate branch is `teacher_student_blend_v51` through `teacher_student_blend_v54`

Use [PROGRESS_AGENT3.md](/home/jorge/agent3/tasks/astar/PROGRESS_AGENT3.md) for the timestamped ledger and artifact paths.
