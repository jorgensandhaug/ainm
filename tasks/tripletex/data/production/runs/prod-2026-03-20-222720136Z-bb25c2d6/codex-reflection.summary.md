## 1. Task

Post-run learning pass for the scored production task: create supplier `Cascade SARL`, org no `997712560`, email `faktura@cascadesarl.no`, then update learning docs and commit.

## 2. Reflection

Went well:
- Original scored run matched the exact trusted-standard shape.
- Used the correct one-call path: `POST /supplier`.
- Mirrored the invoice-looking prompt email into both `email` and `invoiceEmail`.
- Reused the write response directly; no follow-up `GET`.
- Avoided all `4xx` and avoided the `/v2` URL-join trap.

Went poorly:
- No API-path mistake happened.
- The only real gap was documentation clarity: the supplier docs already covered invoice-looking emails, but did not explicitly anchor the exact French prompt shape or French `E-mail` wording. That gap could make a future agent waste time re-checking spec or second-guessing localization.

Correct approach:
- Keep the exact one-write path for this task family.
- Treat French `E-mail` exactly like generic `Email`/`E-post`.
- Do not add pre-reads, duplicate checks, speculative address fields, or follow-up reads.

## 3. Call Efficiency

The original scored run was minimal-call.

Exact scored path used:
1. `POST /supplier`

Wasted calls:
- None.

Realistic lower-call replacement path for the next agent:
- Same as above. There is no lower-call path than one successful `POST /supplier` for this exact create-supplier shape.

Exact payload shape the next agent should use:
```json
{
  "name": "Cascade SARL",
  "organizationNumber": "997712560",
  "email": "faktura@cascadesarl.no",
  "invoiceEmail": "faktura@cascadesarl.no"
}
```

## 4. Root Causes

- Prior public supplier-create evidence had mixed scorer outcomes, so localization-specific confidence was weaker than it should have been.
- The docs did not explicitly say that French supplier-create wording still stays on the exact trusted-standard fast path.
- The docs also did not explicitly list French `E-mail` beside other generic email labels.

## 5. Sandbox Verification

Used only sandbox credentials.

Proof run:
- One `POST /supplier` to `https://kkpqfuj-amager.tripletex.dev/v2/supplier`
- Payload: `Cascade SARL Reflection 321000010`, org no `321000010`, `email=invoiceEmail=faktura-321000010@cascadesarl.no`
- Result: `201 Created`
- Returned supplier id: `108283330`
- Response preserved `name`, `organizationNumber`, `email`, and `invoiceEmail`
- No read needed after the write

This confirms the same one-call mirrored-email path for the exact French-style task family.

## 6. Playbook Changes

Updated existing files:
- `trusted-standards/create-supplier.md`
- `task-playbooks/create-supplier.md`

Changes made:
- Added the exact French production success for `Cascade SARL`
- Added a fresh persistent-sandbox proof for the same French-style shape
- Clarified that French `E-mail` still maps to generic `email`
- Clarified that French prompt language does not justify extra reads or spec re-checking

No new trusted standard created.
No new playbook created.
No `AGENTS.md` change needed for this task.
No `trusted-standards/common-endpoints.md` change needed for this task.

## 7. Commit

Commit hash:
- `c0ab8b9cdc99de182db4363837620b140842306f`

Commit message:
- `tripletex playbook: tighten create-supplier french exact path`

## 8. Reusable Heuristics

- Exact supplier-create prompt with only `name + organizationNumber + one generic email` stays on the one-write trusted standard.
- If that lone email looks invoice-oriented, mirror it into both `email` and `invoiceEmail` in the same `POST /supplier`.
- Do not spend `GET /supplier` before create on fresh-account runs.
- Do not spend `GET /supplier/{id}` after a successful `201` when `response.value` already contains the scored fields.
- Do not invent address fields just because Tripletex auto-returns sparse address links.
- Do not let French wording trigger extra exploration; localization here changes prompt language, not API path.
- When base URL already ends in `/v2`, build with `new URL("supplier", baseUrlWithTrailingSlash)` to avoid escaping to host root.