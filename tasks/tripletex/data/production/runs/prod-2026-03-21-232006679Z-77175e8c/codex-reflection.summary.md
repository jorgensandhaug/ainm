# Codex Reflection Summary

## Task
Create product "Datarådgjeving" with product number 4993, price 16250 kr excluding VAT, standard 25% VAT rate. Nynorsk prompt.

## Reflection
The run executed perfectly. The agent:
1. Recognized this as an exact trusted-standard match (fresh-account standard-25% product create)
2. Read the trusted standard before writing any script
3. Executed the one-call path: single `POST /product` with `name`, `number`, `priceExcludingVatCurrency` — no explicit `vatType`
4. Verified from the 201 response that `priceIncludingVatCurrency=20312.5` (correct 25% computation) and `vatType.id=3`
5. Stopped immediately — no wasted verification GETs

Nothing went wrong. The Nynorsk wording ("nyttast", "eksklusiv MVA") was correctly handled without any special treatment.

## Call Efficiency
**Minimal-call: YES** — 1 API call, 0 errors.

The one-call path (`POST /product` without explicit `vatType`) is the proven optimal path for this exact task shape. No calls were wasted. No pre-reads, no VAT lookups, no post-verification GETs.

Lower-call path for next agent: identical — one `POST /product` with `name`, `number`, `priceExcludingVatCurrency`.

## Root Causes
No errors or inefficiencies to diagnose. The trusted standard was correctly matched and followed.

## Sandbox Verification
- Sandbox `POST /product` without `vatType` still auto-fills `vatType.id=6` (0%) — confirming the one-call shortcut remains account-dependent
- Sandbox still has only `OUTGOING` VAT row `id=6` / `0%` — still blocked for 15%/25% VAT verification
- The production run itself serves as the primary verification for the 25% one-call path

## Playbook Changes
Updated existing files only (no new files created):
- `./trusted-standards/create-product.md` — added 11th production confirmation (Nynorsk 25%, first `nn` language confirmation for standard-25% shape); extends proven language set to {de, en, es, pt, fr, nn}
- `./task-playbooks/create-product.md` — added same 11th production confirmation with full details

No AGENTS.md changes needed — create-product table entries already correct.

## Commit
- Hash: `4e4b633e`
- Message: `tripletex playbook: create-product — add 11th production confirmation (77175e8c, Nynorsk prompt, Datarådgjeving / 4993 / 16250 kr eksklusiv MVA / standard 25%, 1 call 0 errors); first Nynorsk 25% confirmation; extends proven 25% language set from {de, en, es, pt, fr} to {de, en, es, pt, fr, nn}; 11 consecutive optimal runs across de/en/es/pt/fr/nn confirm the one-call path is fully language-independent and stable`

## Reusable Heuristics
1. **Nynorsk 25% is now proven**: "eksklusiv MVA" + "nyttast" (shall be used) in Nynorsk maps to the same one-call path as all other languages. No special handling needed.
2. **11 consecutive 1-call successes** across 6 languages (de/en/es/pt/fr/nn) confirm the fresh-account standard-25% one-call path is fully language-independent and stable.
3. **The one-call shortcut stays account-dependent**: sandbox still auto-fills 0% (`vatType.id=6`), so this shortcut must not be generalized beyond the exact fresh-account standard-25% shape.
4. **For this exact task shape, the agent should**: read the trusted standard, write one `POST /product` script, verify from the 201 response, stop. No openapi.json check, no VAT lookup, no verification GET.
