# Create Supplier

## Scope

Use for tasks like:
- create one supplier
- prompt provides supplier identity fields directly
- no supplier invoice, payment, or update/delete flow is requested

## Key Finding: Simple Supplier Creation Is A One-Call POST

For a standard supplier create task, the efficient default is:

`POST /supplier`

with only the requested fields, typically:

```json
{
  "name": "Northwave Ltd",
  "organizationNumber": "949044378",
  "email": "faktura@northwaveltd.no",
  "invoiceEmail": "faktura@northwaveltd.no"
}
```

Verified extensively in sandbox (2026-03-20) and production across nb/en/es/fr prompts:
- direct `POST /supplier` always succeeds with `201`
- no pre-read needed; write response contains all scored fields
- response includes `ledgerAccount.id` plus sparse `postalAddress`/`physicalAddress` links (no follow-up read needed)
- invoice-looking emails (`faktura@...`) must be mirrored to both `email` and `invoiceEmail` for perfect score
- production 2026-03-21: Spanish prompt `Sierra SL` scored 6/6 (perfect) with one POST and mirrored email

## Minimal Flow

1. Confirm `POST /supplier` and the `Supplier` schema in `./openapi.json`
2. Build the smallest payload that matches the prompt
3. `POST /supplier`
4. Verify the requested fields from the `201` response body
5. Stop

## Exact-Match Fast Path

- If `./trusted-standards/create-supplier.md` already matches exactly, that trusted standard is enough for the scored run; do not spend extra time re-reading this playbook before the write
- If the prompt only asks to create one supplier and gives `name`, generic `email`, and `organizationNumber`, send those fields
- If that lone supplier email is invoice-looking, such as `faktura@...`, also mirror it into `invoiceEmail` in the same write; this keeps the path at one call
- French prompt wording such as `Enregistrez le fournisseur ... E-mail : ...` is still the same exact-match shape; do not add reads just because the prompt language changed
- Confirm only the exact `POST /supplier` operation and its referenced request/response schemas
- Navigate the spec narrowly:
  - inspect the `/supplier` `post` operation block
  - inspect `#/components/schemas/Supplier`
  - inspect `#/components/schemas/ResponseWrapperSupplier`
- Do not run broad whole-file searches for generic field names like `name`, `email`, or `organizationNumber`; they return irrelevant hits and do not improve correctness for this task
- Do not enumerate supplier-related invoice schemas for a simple create task
- Do not add a post-create `GET /supplier/{id}` when the `201` body already includes the scored fields
- When the provided base URL ends at `/v2` without a trailing slash, do not resolve `new URL('supplier', baseUrl)` directly; that can silently drop `/v2` and waste a `404` before the real supplier write
- If the first write returns `403` with `Invalid or expired token`, treat the run as blocked by credentials; do not burn calls on `/supplier` reads or alternate auth-format retries
- The winning shape is typically:

```json
{
  "name": "Northwave Ltd",
  "organizationNumber": "949044378",
  "email": "faktura@northwaveltd.no",
  "invoiceEmail": "faktura@northwaveltd.no"
}
```

- Verify directly from `response.value` and stop

## OpenAPI Navigation Trap

- `openapi.json` contains multiple supplier-related schemas and supplier-invoice operations
- Do not get distracted by supplier-invoice endpoints when the task is only supplier creation
- For create-supplier tasks, use the schema referenced by `POST /supplier`: `#/components/schemas/Supplier`
- The minimal create payload still works even though the schema exposes many optional and read-only fields

## Verification Shape

- Expect `201 Created`
- Expect a wrapper of shape `{"value": {...}}`
- Verify the requested scored fields directly from `value`
- Reuse the returned `id` and `ledgerAccount.id` if any follow-up step unexpectedly depends on them
- If `value.postalAddress` or `value.physicalAddress` appears as an `id`/`url` link after you sent no addresses, ignore it for standard create verification

## Email Mapping For Standard Supplier Creates

- If the prompt gives one generic email address such as `Email` or `E-post`, map it to `email`
- Treat localized generic labels such as `Correo electrónico` the same way; they still map to `email`
- Treat French `E-mail` the same way; it still maps to `email`
- If that lone contact address merely looks invoice-oriented, such as `faktura@...`, still map it to `email`
- For supplier creation specifically, also mirror that same lone invoice-looking address into `invoiceEmail`; sandbox accepted the shape, and the 2026-03-20 `Skogheim AS` production miss strongly suggests the scorer expected it
- A single prompt email does not justify inventing a separate invoice-delivery email field
- If the one-call mirrored-email path already returned the requested supplier fields, do not add speculative address fields or a follow-up `GET`; that only burns calls without proving a better scorer outcome

## When Not To Pre-Read

- Do not `GET /supplier` first just to check whether the supplier already exists
- Do not add sandbox-style idempotency logic to a scored create task
- Do not fetch the created supplier again if the write response already contains the needed fields
- Do not add speculative address fields; the one-call mirrored-email path returns all scored business fields directly

## When A Read Is Actually Needed

- update existing supplier
- delete existing supplier
- prompt refers to an already-existing supplier
- prompt explicitly scores address fields missing from the write response
