# Task 23 — Frontier Import: non-invoice line booking

## Verdict

Import justified at the **research conclusion** level.

Main already has a Task 23 implementation in progress, so this note records the frontier that improving agents must inherit even when code paths diverge.

## Observed ceiling in legacy production runs

All examined attributed production runs for Task 23 plateau at the same result:

- normalized score: `0.6 / 6`
- behavior: `11 API calls`, `0 errors`
- scoring shape: `Check 2 passes`, `Check 1 fails`

The common pattern is invoice-only reconciliation: customer payments and supplier voucher handling succeed, but non-invoice CSV rows are skipped.

## Imported frontier idea

The preserved frontier idea is:

> **Book all bank-statement lines, including non-invoice rows, instead of skipping them.**

That includes rows like:

- interest income (`Renteinntekter`)
- tax withholding (`Skattetrekk`)
- bank fees / bank adjustments (`Bankgebyr`)

The important frontier claim is not the exact account-number choice; it is that the old trusted-standard instruction to skip those rows is likely the structural reason the score ceiling never moved beyond `0.6 / 6`.

## Why this frontier matters

- The old flow already appears efficient enough for the invoice-linked rows.
- The repeated `0.6 / 6` ceiling strongly suggests a **correctness gap**, not merely an efficiency gap.
- The clearest hypothesis is that full-bank-statement reconciliation requires posting the non-invoice rows too.

## What remains uncertain

1. Exact counter-account numbers for non-invoice rows still need sandbox verification.
2. The scorer may expect a specific voucher grouping strategy.
3. The task may still need stronger typed input / attachment-surface discipline.
4. The current main implementation and the agent-branch implementation diverged; future work should compare them deliberately instead of assuming they are identical.

## Durable instruction for improving agents

When working on Task 23:

- do **not** assume skipping non-invoice rows is acceptable
- treat full CSV reconciliation as the current frontier hypothesis
- verify in sandbox before promoting anything
- record whether the scorer wants combined vouchers or split vouchers for non-invoice lines
