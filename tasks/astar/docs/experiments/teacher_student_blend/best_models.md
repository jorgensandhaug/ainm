# Best Models

No post-pivot full-family winner is promoted yet.

Current finished corrected-holdout ranking:

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

- strongest finished branch is now the simple temporal + coefficient-residual line with `k=1`
- the gain is real but tiny: `v45` beats `v13` by only `+0.0126` score and `-0.000075` KL
- residual-distance shrink is nearly neutral: `v35` / `v37` tied the leaders but did not beat them
- lowering `k` helped slightly on both backbones: `v43/v45` beat `v13`, `v44/v46` beat `v15`
- multiscale temporal summaries lost on both global and spatial-dynamic backbones
- geometry-gated / class-weighted local blur branch also lost badly (`v25/v27/v28`)

Active corrected-holdout queue now includes:

- no corrected-holdout job is currently trusted as live
- `v39-v42` and the first full `v13/v15` promotion runs died before writing final artifacts because they were not launched detached
- next promotion target is `teacher_student_blend_v45`
- next corrected-gate branch is `teacher_student_blend_v47` through `teacher_student_blend_v50`

Use [PROGRESS_AGENT3.md](/home/jorge/agent3/tasks/astar/PROGRESS_AGENT3.md) for the timestamped ledger and artifact paths.
