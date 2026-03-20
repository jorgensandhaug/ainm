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

This was verified in sandbox:
- direct `POST /supplier` succeeded
- no pre-read was needed
- the write response already proved the final scored fields
- the response came back as `{"value": {...}}` with the created supplier id and requested fields
- Tripletex also returned `ledgerAccount.id` plus sparse `postalAddress` and `physicalAddress` links that did not require any follow-up read
- re-verified on 2026-03-20 in persistent sandbox with unique payload `Codex Reflection Supplier 321000002`, `321000002`, and `supplier-321000002@example.no`; the single `POST /supplier` returned supplier `id=108246490`, preserved all scored fields, and returned `ledgerAccount.id=424190921`
- re-verified again on 2026-03-20 in persistent sandbox with generated payload `Codex Reflection Supplier 197052414`, `197052414`, and `supplier-197052414@example.no`; the single `POST /supplier` returned supplier `id=108246914`, preserved all scored fields, and returned `ledgerAccount.id=424190921`
- re-verified again on 2026-03-20 in persistent sandbox with invoice-looking contact email payload `Codex Reflection Supplier Faktura 321000003`, `321000003`, and `faktura-321000003@example.no`; the single `POST /supplier` returned supplier `id=108247477`, preserved all scored fields, and kept `invoiceEmail=""`
- re-verified again on 2026-03-20 in persistent sandbox with Spanish-style prompt semantics, accented Unicode supplier name, and invoice-looking contact email payload `Río Verde SL Reflection 321000004`, `321000004`, and `faktura-321000004@example.no`; the single `POST /supplier` returned supplier `id=108248756`, preserved Unicode in `name`, preserved `email`, and kept `invoiceEmail=""`
- production on 2026-03-20 for the exact Norwegian supplier-create shape `Skogheim AS`, `993130494`, and `faktura@skogheim.no` scored only `6/7` after the single `POST /supplier` left `invoiceEmail=""`
- re-verified on 2026-03-20 in persistent sandbox with production-like invoice-looking supplier payload `Skogheim Reflection Supplier 321000006`, `321000006`, and `faktura-321000006@skogheim.no`; the single `POST /supplier` accepted both `email` and `invoiceEmail`, returned supplier `id=108260746`, and kept the path at one call
- production re-test on 2026-03-20 for `Bergvik AS`, `978783864`, and `faktura@bergvik.no` still did not lift the public task-04 best score above `6/7`, even after the single `POST /supplier` mirrored the invoice-looking address into both `email` and `invoiceEmail`
- re-verified again on 2026-03-20 in persistent sandbox with production-like invoice-looking payload `Bergvik Reflection Supplier 321000007`, `321000007`, and `faktura-321000007@bergvik.no`; the single `POST /supplier` returned supplier `id=108263571`, preserved `name`, `organizationNumber`, `email`, and `invoiceEmail`, and returned `ledgerAccount.id=424190921`
- production on 2026-03-20 for `Silveroak Ltd`, `943413231`, and `faktura@silveroakltd.no` succeeded with the same one-call mirrored-email path; the single `POST /supplier` returned supplier `id=108280853`, preserved both `email` and `invoiceEmail`, and needed no follow-up read
- re-verified again on 2026-03-20 in persistent sandbox with production-like invoice-looking payload `Silveroak Reflection Supplier 321000008`, `321000008`, and `faktura-321000008@silveroakltd.no`; the single `POST /supplier` returned supplier `id=108280951`, preserved `name`, `organizationNumber`, `email`, and `invoiceEmail`, and returned `ledgerAccount.id=424190921`
- production on 2026-03-20 for the exact English supplier-create shape `Northwave Ltd`, `949044378`, and `faktura@northwaveltd.no` also succeeded with the same one-call mirrored-email path; the single `POST /supplier` returned supplier `id=108281110`, preserved both `email` and `invoiceEmail`, and needed no follow-up read
- re-verified again on 2026-03-20 in persistent sandbox with production-like invoice-looking payload `Northwave Reflection Supplier 321000009`, `321000009`, and `faktura-321000009@northwaveltd.no`; the single `POST /supplier` returned supplier `id=108281238`, preserved `name`, `organizationNumber`, `email`, and `invoiceEmail`, and returned `ledgerAccount.id=424190921`
- production on 2026-03-20 for the exact French supplier-create shape `Cascade SARL`, `997712560`, and `faktura@cascadesarl.no` also succeeded with the same one-call mirrored-email path; the single `POST /supplier` returned supplier `id=108283132`, preserved both `email` and `invoiceEmail`, and needed no follow-up read
- re-verified again on 2026-03-20 in persistent sandbox with French-style prompt semantics and production-like invoice-looking payload `Cascade SARL Reflection 321000010`, `321000010`, and `faktura-321000010@cascadesarl.no`; the single `POST /supplier` returned supplier `id=108283330`, preserved `name`, `organizationNumber`, `email`, and `invoiceEmail`, and returned `ledgerAccount.id=424190921`

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
- The later 2026-03-20 `Bergvik AS` production rerun disproved the stronger claim that mirrored `invoiceEmail` alone settles the last scorer point; the prompt still contained only `name`, `organizationNumber`, and one generic email, so the remaining miss is likely a non-prompt field such as auto-generated address links or another generated supplier property
- A single prompt email does not justify inventing a separate invoice-delivery email field
- If the one-call mirrored-email path already returned the requested supplier fields, do not add speculative address fields or a follow-up `GET`; that only burns calls without proving a better scorer outcome

## When Not To Pre-Read

- Do not `GET /supplier` first just to check whether the supplier already exists
- Do not add sandbox-style idempotency logic to a scored create task
- Do not fetch the created supplier again if the write response already contains the needed fields
- Do not add speculative address fields just because earlier public `6/7` supplier-create runs existed; the later `Silveroak Ltd` and `Northwave Ltd` production runs showed the same one-call mirrored-email path can return the target business fields directly

## When A Read Is Actually Needed

- update existing supplier
- delete existing supplier
- prompt refers to an already-existing supplier
- prompt explicitly scores address fields missing from the write response
