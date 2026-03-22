# Create Customer

## Scope

Use for tasks like:
- create one customer
- prompt provides customer identity fields directly
- no invoice, order, payment, or update/delete flow is requested

## Key Finding: Simple Customer Creation Is A One-Call POST

For a standard Norwegian customer create task, the efficient default is:

`POST /customer`

with only the requested fields, typically:

```json
{
  "name": "Reflection Smoke Test AS",
  "email": "post@reflection-smoke.no",
  "organizationNumber": "999888777"
}
```

This was verified in sandbox:
- direct `POST /customer` succeeded
- no pre-read was needed
- the write response already proved the final scored fields
- Tripletex filled defaults like `invoiceSendMethod=EMAIL` and `emailAttachmentType=ATTACHMENT`
- the response came back as `{"value": {...}}` with the created customer id and requested fields
- when the prompt gave a single street address, `postalAddress` alone was sufficient; no `physicalAddress` was needed
- re-verified on 2026-03-19 with only `name`, `email`, and `organizationNumber`; the `201` response again contained the created customer plus default invoice delivery fields
- re-verified on 2026-03-19 in persistent sandbox with `name`, `organizationNumber`, `email`, and `postalAddress`; the `201` response preserved non-ASCII text such as `Grünfeld` and `Ålesund` and still defaulted `invoiceSendMethod=EMAIL` and `emailAttachmentType=ATTACHMENT` without needing `invoiceEmail`
- re-verified on 2026-03-19 with `name`, `email`, `organizationNumber`, and `postalAddress`; the same single `POST /customer` stored the exact Unicode city string `Tromsø` and returned it directly in `response.value.postalAddress.city`
- re-verified on 2026-03-20 with only `name`, `email`, and `organizationNumber`; the single `201` response again returned the created customer plus defaults `invoiceSendMethod=EMAIL` and `emailAttachmentType=ATTACHMENT`
- re-verified on 2026-03-20 in persistent sandbox with the exact prompt payload `Debug Test AS`, `debug@example.no`, and `999888771`; the single `POST /customer` returned customer `id=108240642` plus default `invoiceSendMethod=EMAIL` and `emailAttachmentType=ATTACHMENT`
- re-verified on 2026-03-20 in persistent sandbox with unique payload `Codex Post Run 372928 AS`, `codex-post-run-372928@example.no`, and `999372928`; the single `POST /customer` returned customer `id=108240652` plus default `invoiceSendMethod=EMAIL` and `emailAttachmentType=ATTACHMENT`
- re-verified on 2026-03-20 in persistent sandbox with unique payload `Codex Reflection 269241 AS`, `codex-reflection-269241@example.no`, `999269241`, and `postalAddress`; the single `POST /customer` returned customer `id=108245322`, preserved `Sjøgata 85` and `Trondheim`, and also auto-returned a sparse `physicalAddress` link without needing any extra read
- re-verified on 2026-03-20 in persistent sandbox with unique payload `Codex Reflection 722064 AS`, `codex-reflection-722064@example.no`, and `999722064`; the single `POST /customer` returned customer `id=108246240` plus default `invoiceSendMethod=EMAIL` and `emailAttachmentType=ATTACHMENT`
- re-verified on 2026-03-20 in persistent sandbox with unique payload `Solmar Reflection 6602846b AS`, `post-reflection-6602846b@solmar.no`, `999660284`, and `postalAddress` `Parkveien 49`, `4611`, `Kristiansand`; the single `POST /customer` returned customer `id=108246353`, preserved the exact postal fields, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
- re-verified on 2026-03-20 in persistent sandbox with unique payload `Codex Reflection 64b4936f AS`, `post-reflection-64b4936f@example.no`, `999493664`, and `postalAddress` `Fjordveien 129`, `2317`, `Hamar`; the single `POST /customer` returned customer `id=108248251`, preserved the exact postal fields, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
- re-verified on 2026-03-20 in production for the German-language prompt `Grünfeld GmbH`, `886669445`, `post@grunfeld.no`, and `Kirkegata 87, 6003 Ålesund`; the single `POST /customer` returned customer `id=108268199`, preserved the exact Unicode name and city, and still needed no follow-up read
- re-verified again on 2026-03-20 in persistent sandbox with production-like German prompt semantics and unique payload `Grünfeld Reflection 201018 AS`, `post-reflection-201018@grunfeld.no`, `999201018`, and `postalAddress` `Kirkegata 87`, `6003`, `Ålesund`; the same single `POST /customer` returned customer `id=108268237`, preserved the exact Unicode name and city, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
- re-verified on 2026-03-20 in production for the French-language prompt `Colline SARL`, `939137599`, `post@colline.no`, and `Kirkegata 77, 4611 Kristiansand`; the single `POST /customer` returned customer `id=108284978`, preserved the exact name, email, and postal fields, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
- re-verified on 2026-03-20 in persistent sandbox with production-like French prompt semantics and unique payload `Colline Reflection c833b15d SARL`, `post-reflection-c833b15d@colline.no`, `999833115`, and `postalAddress` `Kirkegata 77`, `4611`, `Kristiansand`; the same single `POST /customer` returned customer `id=108285083`, preserved the exact postal fields, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
- re-verified on 2026-03-20 in production for the Spanish-language prompt `Río Verde SL`, `919234830`, `post@rio.no`, and `Solveien 5, 4006 Stavanger`; the single `POST /customer` returned customer `id=108285940`, preserved the exact accented Unicode name plus email and postal fields, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
- re-verified on 2026-03-20 in persistent sandbox with production-like Spanish prompt semantics and unique payload `Río Verde Reflection 017503 AS`, `post-reflection-017503@rio.no`, `999017503`, and `postalAddress` `Solveien 5`, `4006`, `Stavanger`; the same single `POST /customer` returned customer `id=108286045`, preserved the exact accented Unicode name and postal fields, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
- re-verified on 2026-03-21 in production for the Portuguese-language prompt `Porto Alegre Lda`, `964528136`, `post@porto.no`, and `Sjøgata 128, 4611 Kristiansand`; the single `POST /customer` returned customer `id=108384576`, preserved the exact name, email, and postal fields, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
- re-verified on 2026-03-21 in persistent sandbox with production-like Portuguese prompt semantics and unique payload `Porto Alegre Reflection 6ed2ed87 Lda`, `post-reflection-6ed2ed87@porto.no`, `999238926`, and `postalAddress` `Sjøgata 128`, `4611`, `Kristiansand`; the same single `POST /customer` returned customer `id=108384756`, preserved the exact postal fields, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
- re-verified on 2026-03-21 in production for the Portuguese-language prompt `Porto Alegre Lda`, `834147254`, `post@porto.no`, and `Storgata 65, 4611 Kristiansand`; one `POST /customer` returned customer `id=108436350`, 7/7 checks passed, 1 call 0 errors
- re-verified on 2026-03-21 in persistent sandbox with unique payload `Porto Alegre Reflection 92322c6b Lda`, `post-reflection-92322c6b@porto.no`, `999923226`, and `postalAddress` `Storgata 65`, `4611`, `Kristiansand`; the same single `POST /customer` returned customer `id=108436730`, preserved all postal fields, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
- re-verified on 2026-03-21 in production for the Norwegian-language prompt `Nordlys AS`, `951285463`, `post@nordlys.no`, and `Parkveien 45, 5003 Bergen`; one `POST /customer` returned customer `id=108442350`, preserved all scored fields including postal address, 1 call 0 errors
- re-verified on 2026-03-21 in persistent sandbox with unique payload `Nordlys Reflection b2cb8ce1 AS`, `post-reflection-b2cb8ce1@nordlys.no`, `999828211`, and `postalAddress` `Parkveien 45`, `5003`, `Bergen`; the same single `POST /customer` returned customer `id=108442597`, preserved all postal fields, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
- re-verified on 2026-03-21 in production for the Portuguese-language prompt `Floresta Lda`, `893475656`, `post@floresta.no`, and `Kirkegata 132, 7010 Trondheim`; one `POST /customer` returned customer `id=108442473`, 1 call 0 errors
- re-verified on 2026-03-21 in persistent sandbox with unique payload `Floresta Reflection b3fb95fd Lda`, `post-reflection-b3fb95fd@floresta.no`, `999395956`, and `postalAddress` `Kirkegata 132`, `7010`, `Trondheim`; the same single `POST /customer` returned customer `id=108442707`, preserved all postal fields, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
- re-verified on 2026-03-21 in production for the German-language prompt `Bergwerk GmbH`, `946768693`, `post@bergwerk.no`, and `Solveien 5, 3015 Drammen`; one `POST /customer` returned customer `id=108442567`, preserved all scored fields including postal address, 1 call 0 errors
- re-verified on 2026-03-21 in persistent sandbox with unique payload `Bergwerk Reflection 4665a70c GmbH`, `post-reflection-4665a70c@bergwerk.no`, `999466570`, and `postalAddress` `Solveien 5`, `3015`, `Drammen`; the same single `POST /customer` returned customer `id=108442922`, preserved all postal fields, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
- re-verified on 2026-03-21 in production for the French-language prompt `Montagne SARL`, `931564153`, `post@montagne.no`, and `Kirkegata 19, 4611 Kristiansand`; one `POST /customer` returned customer `id=108443318`, preserved all scored fields including postal address, 1 call 0 errors
- re-verified on 2026-03-21 in persistent sandbox with unique payload `Montagne Reflection 849e049c SARL`, `post-reflection-849e049c@montagne.no`, `999849049`, and `postalAddress` `Kirkegata 19`, `4611`, `Kristiansand`; the same single `POST /customer` returned customer `id=108443605`, preserved all postal fields, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
- re-verified on 2026-03-22 in production for the Norwegian-language prompt `Skogheim AS`, `855954346`, `post@skogheim.no`, and `Parkveien 17, 4611 Kristiansand`; one `POST /customer` returned customer `id=108460639`, preserved all scored fields including postal address, 1 call 0 errors
- re-verified on 2026-03-22 in persistent sandbox with unique payload `Skogheim Reflection 4997b67e AS`, `post-reflection-4997b67e@skogheim.no`, `999497676`, and `postalAddress` `Parkveien 17`, `4611`, `Kristiansand`; the same single `POST /customer` returned customer `id=108461059`, preserved all postal fields, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
- re-verified on 2026-03-22 in production for the English-language prompt `Greenfield Ltd`, `872154442`, `post@greenfield.no`, and `Sjøgata 85, 7010 Trondheim`; one `POST /customer` returned customer `id=108463541`, preserved all scored fields including Unicode postal address, 1 call 0 errors
- re-verified on 2026-03-22 in persistent sandbox with unique payload `Greenfield Reflection 7d01d632 Ltd`, `post-reflection-7d01d632@greenfield.no`, `999701632`, and `postalAddress` `Sjøgata 85`, `7010`, `Trondheim`; the same single `POST /customer` returned customer `id=108463872`, preserved all postal fields, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
- re-verified on 2026-03-22 in production for the English-language prompt `Windmill Ltd`, `884659876`, `post@windmill.no`, and `Parkveien 124, 7010 Trondheim`; one `POST /customer` returned customer `id=108464911`, preserved all scored fields including postal address, 1 call 0 errors
- re-verified on 2026-03-22 in persistent sandbox with unique payload `Windmill Reflection de7f6ef9 Ltd`, `post-reflection-de7f6ef9@windmill.no`, `999767609`, and `postalAddress` `Parkveien 124`, `7010`, `Trondheim`; the same single `POST /customer` returned customer `id=108465324`, preserved all postal fields, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read

## Minimal Flow

1. Confirm `POST /customer` and the `Customer` schema in `./openapi.json`
2. Build the smallest payload that matches the prompt
3. `POST /customer`
4. Verify the requested fields from the `201` response body
5. Stop

## Exact-Match Fast Path

- If `./trusted-standards/create-customer.md` already matches exactly, that trusted standard is enough for the scored run; do not spend extra time re-reading this playbook before the write
- If the prompt only asks to create one customer and gives `name`, `email`, and `organizationNumber`, send exactly those fields
- Confirm only the exact `POST /customer` operation and its referenced request/response schemas
- Navigate the spec narrowly:
  - inspect the `/customer` `post` operation block
  - inspect `#/components/schemas/Customer`
  - inspect `#/components/schemas/ResponseWrapperCustomer`
- Do not run broad whole-file searches for generic field names like `name`, `email`, or `organizationNumber`; they return irrelevant hits and do not improve correctness for this task
- Do not enumerate other customer-related schemas or add a pre-read just because sandbox is persistent
- Do not add a post-create `GET /customer/{id}` when the `201` body already includes the scored fields
- If the prompt also gives one ordinary mailing address, add only `postalAddress`
- Do not open extra schemas just to confirm the standard `postalAddress` shape unless the prompt introduces a foreign address, separate physical address, or the first write fails
- Do not transliterate prompt text; preserve Unicode in customer and city names exactly as given
- Do not switch away from the standard one-call path just because the prompt prose is French, German, Portuguese, or another non-Norwegian language when the actual customer fields still describe an ordinary Norwegian customer
- The winning shape is typically:

```json
{
  "name": "Same Agent Prompt Test AS",
  "email": "post@same-agent-prompt.no",
  "organizationNumber": "999888777"
}
```

- Verify directly from `response.value` and stop

## Credential / Connectivity Trap

- If the prompt-provided base URL is obviously a placeholder or non-routable host such as `example.invalid`, or the token is obvious dummy text, the create-customer write shape is still the same single `POST /customer`, but the run is blocked before Tripletex receives the request
- Do not react to that situation by adding `GET /customer`, trying alternate Tripletex hosts, or widening spec exploration
- If both host and token are obvious placeholders, it is acceptable to stop after local playbook/spec confirmation instead of spending a doomed network call
- For real-looking credentials, one execution attempt is enough; if DNS/network fails before any HTTP response, treat it as a credential/connectivity problem, not a signal to change the customer payload

## OpenAPI Navigation Trap

- `openapi.json` contains multiple customer-related schemas
- Do not get misled by later read-only customer/account representations
- For create-customer tasks, use the schema referenced by `POST /customer`: `#/components/schemas/Customer`
- The minimal create payload still works even though other customer-shaped schemas expose many extra or read-only fields
- Broad regex searches over the whole spec can flood local context with unrelated customer/account references
- For this task shape, whole-file keyword search is an efficiency mistake even if the eventual API write still succeeds

## Verification Shape

- Expect `201 Created`
- Expect a wrapper of shape `{"value": {...}}`
- Verify the requested scored fields directly from `value`
- If `value.physicalAddress` appears as an `id`/`url` link after you only sent `postalAddress`, ignore it for standard create verification
- Reuse the returned `id` if any follow-up step unexpectedly depends on it

## Address Mapping For Standard Customer Creates

- If the prompt gives one ordinary postal/street address, map it to `postalAddress`
- Preserve address strings exactly as given in the prompt, including non-ASCII characters like `ø`
- Use:

```json
{
  "postalAddress": {
    "addressLine1": "Sjøgata 51",
    "postalCode": "9008",
    "city": "Tromsø"
  }
}
```

- Do not guess `physicalAddress` as well unless the prompt explicitly distinguishes a separate visiting/physical address
- The `201` response can already prove the stored address fields, so no follow-up `GET` is needed
- Tripletex can still auto-return a sparse `physicalAddress` link object in that same `201` response; that is not a signal to add `physicalAddress` to the payload or to fetch the customer again

## Email Mapping For Standard Customer Creates

- If the prompt gives one generic email address such as `E-mail`, `Email`, `E‑post`, or `Correo`, map it to `email`
- Do not also mirror that same address into `invoiceEmail` unless the prompt explicitly says it is the invoice/billing email
- A single prompt email does not, by itself, justify inventing a separate invoice-delivery email field
- The standard create flow still defaults invoice delivery fields from the account/customer setup, so adding `invoiceEmail` speculatively is unnecessary

## When Not To Pre-Read

- Do not `GET /customer` first just to check whether the customer already exists
- Do not add sandbox-style idempotency logic to a scored create task
- Do not fetch the created customer again if the write response already contains the needed fields

## When A Read Is Actually Needed

- update existing customer
- delete or reverse existing customer-related objects
- prompt refers to an already-existing customer
- prompt is ambiguous and you must locate the target entity before writing

## Extra Fields Only When The Prompt Implies Them

- If EHF or another invoice send mode is requested or implied, include the required delivery/address data
- If the prompt gives one normal customer address and does not distinguish address types, send only `postalAddress`
- If the organization is foreign, set country/address fields consistently
- Otherwise, avoid speculative address or invoice configuration fields
