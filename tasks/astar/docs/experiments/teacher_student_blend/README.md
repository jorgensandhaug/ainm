# Teacher/Student Blend

This directory tracks the active `teacher_student_blend` family.

Canonical live ledger:

- `/home/jorge/agent3/tasks/astar/PROGRESS_AGENT3.md`

Family scope:

- replay-backed `HazardTeacher`
- synthetic-live `SummaryBankStudent`
- online-safe blend with `HistoricalBucketPriorPredictor`
- current active branch: temporal/multiscale summary encoders + coefficient residual head + dynamic teacher blending + local evidence updates

Repro commands:

```bash
uv run astar run-historical-benchmark --model teacher_student_blend_v22 --mode online_interactive --policy coverage --budget 50 --with-png none
uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v22 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --jobs 1
```

Current note:

- corrected targeted-holdout workflow is the fast gate
- full leave-one-round-out remains the promotion benchmark
