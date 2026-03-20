## 1. Task

Post-run learning pass for the exact production task shape: create supplier `Northwave Ltd`, org no `949044378`, email `faktura@northwaveltd.no`.

## 2. Reflection

What went well:
- The production run chose the correct exact trusted-standard path.
- It used one `POST /supplier`.
- It mirrored the invoice-looking email into both `email` and `invoiceEmail`.
- Tripletex returned the full scored business fields in the write response, including `email`, `invoiceEmail`, and supplier id `108285982`.

What went poorly:
- The first local Bun execution failed before any HTTP call because the defensive `403` handling had a parenthesis bug.
- That did not waste API calls, but it was still avoidable execution risk inside a scored run.

Correct approach:
- Keep this task on the exact trusted-standard one-write path.
- Use the smallest payload:
```json
{
  "name": "Northwave Ltd",
  "organizationNumber": "949044378",
  "email": "faktura@northwaveltd.no",
  "invoiceEmail": "faktura@northwaveltd.no"
}
```
- Verify from `response.value` and stop.

## 3. Call Efficiency

This run was minimal-call on the API side.

Realistic minimum:
- `1` API call total: `POST /supplier`

Wasted API calls:
- None.

Non-API waste:
- One local failed Bun execution before the real request, caused by script syntax.

Exact lower-call path the next agent should follow:
1. `POST /supplier`
2. Read `response.value`
3. Stop

There is no lower-call replacement than that for this exact task shape.

## 4. Root Causes

- I added unnecessary complexity to the local error-handling branch for a one-call task and introduced a syntax bug.
- The API strategy itself was already correct; the weakness was implementation discipline, not endpoint selection.
- There was also a latent tooling pitfall worth documenting: when base URL is exactly `.../v2` without trailing slash, `new URL('supplier', baseUrl)` can drop `/v2` and send the request to the wrong path.

## 5. Sandbox Verification

I re-proved the path in persistent sandbox using only sandbox credentials and one write:
- `POST https://kkpqfuj-amager.tripletex.dev/v2/supplier`

Payload used:
```json
{
  "name": "Northwave Reflection Supplier 321000011",
  "organizationNumber": "321000011",
  "email": "faktura-321000011@northwaveltd.no",
  "invoiceEmail": "faktura-321000011@northwaveltd.no"
}
```

Result:
- Success in one call.
- Returned supplier id `108286080`.
- Returned `email` and `invoiceEmail` exactly as sent.
- Returned only sparse auto-generated address links, confirming no follow-up `GET` is needed.

## 6. Playbook Changes

Updated existing docs; created no new files.

Changed paths:
- `AGENTS.md`
- `trusted-standards/common-endpoints.md`
- `trusted-standards/create-supplier.md`
- `task-playbooks/create-supplier.md`

What changed:
- Added the concrete URL-join pitfall for base URLs ending at `/v2` without trailing slash.
- Added the new sandbox re-verification result for the same supplier-create shape.
- Kept the canonical path unchanged: exact supplier-create remains one `POST /supplier`.

## 7. Commit

Commit hash:
- `e9200488c377c8e3cd3410ea3eddf61826c8dfd2`

Commit message:
- `tripletex playbook: tighten supplier-create path`

## 8. Reusable Heuristics

- For exact create-supplier tasks with one generic email and no address requirements, default to one `POST /supplier`.
- If the lone email is invoice-looking, send it in both `email` and `invoiceEmail`.
- Trust `response.value`; do not add `GET /supplier` before or after.
- Do not invent address fields just because Tripletex echoes sparse address links.
- For base URLs already ending in `/v2`, do not use `new URL('supplier', baseUrl)` unless you first normalize the trailing slash; safe concatenation avoids a wasted `404`.
- For one-call tasks, keep the script simple enough that local syntax mistakes are less likely than the API failure branch you are trying to guard against.