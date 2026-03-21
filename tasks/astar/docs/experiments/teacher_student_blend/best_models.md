# Best Models

No post-pivot full-family winner is promoted yet.

Current finished corrected-holdout ranking:

- `teacher_student_blend_v13`: mean score `61.3244`, mean weighted KL `0.163762`
- `teacher_student_blend_v35`: mean score `61.3164`, mean weighted KL `0.163808`
- `teacher_student_blend_v15`: mean score `61.2680`, mean weighted KL `0.164093`
- `teacher_student_blend_v37`: mean score `61.2600`, mean weighted KL `0.164138`
- `teacher_student_blend_v14`: mean score `59.9971`, mean weighted KL `0.170906`
- `teacher_student_blend_v36`: mean score `59.9978`, mean weighted KL `0.170902`
- `teacher_student_blend_v16`: mean score `59.9179`, mean weighted KL `0.171375`
- `teacher_student_blend_v38`: mean score `59.9185`, mean weighted KL `0.171371`
- `teacher_student_blend_v31`: mean score `59.9922`, mean weighted KL `0.171838`
- `teacher_student_blend_v33`: mean score `59.8833`, mean weighted KL `0.172501`
- `teacher_student_blend_v32`: mean score `58.9782`, mean weighted KL `0.178274`
- `teacher_student_blend_v34`: mean score `58.7956`, mean weighted KL `0.179503`

Current read:

- strongest finished branch is still the simple temporal + coefficient-residual line
- residual-distance shrink is nearly neutral: `v35` / `v37` tied the leaders but did not beat them
- multiscale temporal summaries lost on both global and spatial-dynamic backbones
- geometry-gated / class-weighted local blur branch also lost badly (`v25/v27/v28`)

Active corrected-holdout queue now includes:

- `teacher_student_blend_v17`
- `teacher_student_blend_v18`
- `teacher_student_blend_v19`
- `teacher_student_blend_v20`
- `teacher_student_blend_v21`
- `teacher_student_blend_v22`
- `teacher_student_blend_v23`
- `teacher_student_blend_v24`
- `teacher_student_blend_v26`
- `teacher_student_blend_v35`
- `teacher_student_blend_v36`
- `teacher_student_blend_v37`
- `teacher_student_blend_v38`
- `teacher_student_blend_v39`
- `teacher_student_blend_v40`
- `teacher_student_blend_v41`
- `teacher_student_blend_v42`

Use [PROGRESS_AGENT3.md](/home/jorge/agent3/tasks/astar/PROGRESS_AGENT3.md) for the timestamped ledger and artifact paths.
