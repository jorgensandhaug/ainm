# Family 1 Dummy Harness

Purpose: exercise the Codex loop across about 3 outer iterations.

Rules:

- only one stage unlocks per outer iteration
- verifier reads `FAMILY_1_ITERATION`
- future stages must stay broken until unlocked

Files:

- `stage1.txt`
- `stage2.txt`
- `stage3.txt`
- `check.py`

Expected progression:

1. iteration 1 fixes only `stage1.txt`
2. iteration 2 fixes only `stage2.txt`
3. iteration 3 fixes only `stage3.txt`
