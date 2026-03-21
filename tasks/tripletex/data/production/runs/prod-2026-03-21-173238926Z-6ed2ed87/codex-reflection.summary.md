# Reflection Summary

## 1. Task

Create customer "Porto Alegre Lda" with organization number 964528136, address Sjøgata 128, 4611 Kristiansand, email post@porto.no. Prompt was in Portuguese.

## 2. Reflection

**What went well:**
- Immediately identified this as an exact match for the `create-customer` trusted standard
- Read only the trusted standard (not AGENTS.md fully, not openapi.json, not the playbook)
- Wrote and executed the script with a single `POST /customer` containing exactly the prompt-required fields: `name`, `organizationNumber`, `email`, `postalAddress`
- Got `201` on the first and only API call
- All scored fields preserved correctly including Unicode (`Sjøgata`, `Kristiansand`)
- No follow-up GET, no pre-read, no wasted calls

**What went poorly:**
- Nothing. This was a textbook execution of the trusted standard.

**Mistakes:**
- None. Zero 4xx errors, zero wasted calls.

## 3. Call Efficiency

**The run was minimal-call.** Exactly 1 API call (POST /customer), which is the theoretical minimum for a create-customer task. Zero 4xx errors.

| # | Call | Status | Necessary? |
|---|------|--------|------------|
| 1 | `POST /customer` | 201 | Yes — the only write |

**Wasted calls:** None.

**Exact lower-call path for next agent:** Same — single `POST /customer` with `{name, organizationNumber, email, postalAddress: {addressLine1, postalCode, city}}`.

## 4. Root Causes

No errors or inefficiencies to diagnose. The trusted standard correctly guided the agent to the optimal 1-call path. The Portuguese-language prompt did not cause any deviation — the standard already documented that non-Norwegian prompt language does not change the API path when the customer fields are ordinary Norwegian values.

## 5. Sandbox Verification

Verified in persistent sandbox with unique payload:
- `Porto Alegre Reflection 6ed2ed87 Lda`, org `999238926`, email `post-reflection-6ed2ed87@porto.no`, address `Sjøgata 128, 4611 Kristiansand`
- Single `POST /customer` → 201, customer `id=108384756`
- All postal fields preserved, sparse `physicalAddress` link auto-returned (ignored per standard)
- Confirms the 1-call path is correct and complete for Portuguese-language prompts

## 6. Playbook Changes

**Updated existing files (no new files created):**

- `./trusted-standards/create-customer.md`:
  - Added "Portuguese" to the language list in Payload Rules (French, German, Spanish → French, German, Spanish, Portuguese)
  - Added 2026-03-21 production and sandbox verification entries for the Portuguese prompt variant

- `./task-playbooks/create-customer.md`:
  - Added "Portuguese" to the language mention in the Exact-Match Fast Path section
  - Added 2026-03-21 production and sandbox verification entries for the Portuguese prompt variant

No AGENTS.md table changes needed — `create-customer` trusted standard and playbook already existed.

## 7. Commit

- **Hash:** `e29b0395`
- **Message:** `tripletex playbook: create-customer — add Portuguese production+sandbox proof, 1-call optimal confirmed`

## 8. Reusable Heuristics

1. **Portuguese prompts are the same one-call path.** The trusted standard now explicitly covers `pt` alongside `fr`, `de`, `es`. A Portuguese verb like "Crie" maps to the same `POST /customer` — no special handling needed.
2. **Company suffixes like "Lda" are name text, not entity-type signals.** Treat `Lda`, `GmbH`, `SARL`, `SL` the same as `AS` — they are part of the `name` string, not a reason to change the API flow.
3. **This task shape is fully converged.** The create-customer trusted standard has now been production-verified in 5 non-Norwegian languages (German, French, Spanish, Portuguese, plus Norwegian itself). No further language-specific tweaks are needed for Norwegian-address customers.
4. **Optimal agent behavior for exact trusted-standard matches:** Read only the trusted standard file, write the script, execute, done. Do not read AGENTS.md, openapi.json, or the playbook. This run demonstrated the ideal execution pattern.
