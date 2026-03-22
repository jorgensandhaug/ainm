# Codex Reflection Summary

## 1. Task
Create product "Mantenimiento" with number 4508, price 41500 NOK excluding VAT, standard 25% VAT rate. Spanish prompt with "sin IVA" wording.

## 2. Reflection

**What went well:**
- Immediately identified this as an exact trusted-standard match (fresh-account standard-25% product create)
- Read the trusted standard before writing the script (as required by AGENTS.md)
- Correctly used the one-call shortcut: `POST /product` with `name`, `number`, `priceExcludingVatCurrency` — no explicit `vatType`
- Did not read AGENTS.md, openapi.json, or the playbook during the run (avoided the timeout trap)
- Added verification GET as required by AGENTS.md logging rules
- Zero 4xx errors
- Result: `priceIncludingVatCurrency=51875` (41500×1.25), `vatType.id=3` — all correct

**What went poorly:**
- Nothing. This was a clean, optimal execution.

## 3. Call Efficiency

**The run was minimal-call.**

| Call | Type | Purpose | Necessary? |
|------|------|---------|------------|
| `POST /product` | Write | Create the product | Yes (the only write) |
| `GET /product/{id}?fields=*,vatType(*)` | Read | Verification logging | Yes (required by AGENTS.md logging rules) |

Total: 1 write + 1 GET = 2 API calls, 0 errors.

**Lower-call path:** Not possible. The 1-write path is already optimal for this task shape. The verification GET is mandated by AGENTS.md logging rules and is free from scoring.

## 4. Root Causes

No issues to root-cause. The run executed the canonical path without deviation.

## 5. Sandbox Verification

**New finding:** The persistent sandbox now exposes full OUTGOING VAT types:
- `id=3` (25%), `id=31` (15%), `id=32` (12%), `id=5` (0%), `id=52` (0%), `id=6` (0%)

This is a change from earlier sessions where the sandbox only had `id=6` (0%). The sandbox default now matches production fresh-account behavior: omitting `vatType` from `POST /product` defaults to 25% (id=3).

**Sandbox product creation verified:** `POST /product` with `priceExcludingVatCurrency=41500` returned `priceIncludingVatCurrency=51875` and `vatType.id=3`, matching the production result exactly.

## 6. Playbook Changes

Both the trusted standard and playbook already had this run's production verification entry and sandbox re-verification added in commit `917d08fcb`.

**Files updated:**
- `./trusted-standards/create-product.md` — added 12th production confirmation entry (Spanish, Mantenimiento/4508/41500) and sandbox VAT availability update
- `./task-playbooks/create-product.md` — added 12th production confirmation entry and sandbox re-verification note

## 7. Commit

Commit `917d08fcb` (`runsruns`) — trusted-standard and playbook changes for this run were included in a batch commit.

## 8. Reusable Heuristics

1. **One-call path for standard 25% is rock-solid:** 12 consecutive production confirmations across all 7 tested languages {de, en, es, fr, nn, no, pt}. No need to pre-read VAT types for this exact shape.
2. **Spanish "sin IVA" maps directly to `priceExcludingVatCurrency`:** No special handling needed; same as Portuguese "sem IVA", French "hors TVA", German "ohne MwSt.", Norwegian "eksklusiv MVA".
3. **Read trusted standard, write script immediately:** This run demonstrated the ideal sequence — no time wasted on AGENTS.md, openapi.json, or playbook reads during the scored run.
4. **Sandbox VAT environment has changed:** The persistent sandbox now has the full OUTGOING VAT set including 25%/15%/12%. Future sandbox verifications can now prove all standard VAT paths, not just 0%.
5. **Product number is sent as integer, returned as string:** The API accepts `number: 4508` (integer) and returns `number: "4508"` (string). Both work; no special handling needed.
