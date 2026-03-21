# Create Customer

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- create one new customer
- prompt directly provides customer identity fields
- no invoice, payment, update, delete, or lookup-heavy workflow
- at most one normal mailing address
- at most one generic email address

## Do Not Use This Standard If
- foreign organization number
- separate invoice email requested
- separate physical/visiting address requested
- task is update/delete/search-heavy
- prompt implies special invoice delivery setup

## Standard Flow
1. `POST /customer`
2. verify directly from `response.value`
3. stop

## Exact-Match Fast Path
- for the plain Norwegian create-customer shape, the winning API path is exactly one write:
  - `POST /customer`
- do not spend a pre-read on `/customer`
- do not spend a follow-up read on `/customer/{id}` when `response.value` already contains the scored fields
- do not spend scored-run time re-checking `./task-playbooks/create-customer.md` or `./openapi.json` when this trusted standard already matches exactly

## Payload Rules
- send only prompt-required fields
- normal default shape:
  - `name`
  - `email`
  - `organizationNumber`
- if one ordinary address is given, add only:
  - `postalAddress.addressLine1`
  - `postalAddress.postalCode`
  - `postalAddress.city`
- preserve prompt text exactly, including Unicode
- do not invent `physicalAddress`
- do not invent `invoiceEmail`
- localized generic email labels such as `Correo` and `E-mail` still map to `email`
- prompt language alone does not change this standard; French-, German-, Spanish-, and Portuguese-language prompts with ordinary Norwegian customer fields are still the same one-call create path

## Reuse From Write Response
- `value.id`
- all returned scored customer fields
- returned defaults like `invoiceSendMethod` if later logic unexpectedly needs them
- ignore any sparse auto-generated `value.physicalAddress` link unless the prompt explicitly asked for a separate physical/visiting address

## Verification
- default verification is zero extra calls
- trust the `201` `{"value": {...}}` body
- only do a `GET` if the write response is unexpectedly missing a scored field
- if `value.physicalAddress` appears as a link-only object after sending only `postalAddress`, do not treat that as a missing-field problem

## Known Recovery Branches
- customer delivery validation if prompt explicitly implies EHF/invoice delivery constraints
- country/address consistency for foreign organization numbers

## Pitfalls To Avoid
- do not add duplicate-check logic for fresh-account create tasks
- do not invent `invoiceSendMethod`, `invoiceEmail`, or `physicalAddress` for the standard `name` + `email` + `organizationNumber` prompt shape
- do not treat the returned default delivery fields as a reason to fetch the customer again
- do not escalate to foreign-customer handling just because the prompt text is not Norwegian if the actual organization number and postal address are ordinary Norwegian values

## OpenAPI / Sandbox Status
- endpoint family verified in `./openapi.json`
- repeatedly sandbox-proven as one-call create
- re-verified on 2026-03-20 in persistent sandbox with `postalAddress`; the same one-call write returned the scored postal fields plus a sparse auto-generated `physicalAddress` link
- re-verified on 2026-03-20 in persistent sandbox with only `name`, `email`, and `organizationNumber`; a single `POST /customer` returned customer `id=108246240` plus defaults `invoiceSendMethod=EMAIL` and `emailAttachmentType=ATTACHMENT`
- re-verified on 2026-03-20 in persistent sandbox with `name`, localized generic email input, `organizationNumber`, and `postalAddress` (`Parkveien 49`, `4611`, `Kristiansand`); one `POST /customer` returned customer `id=108246353`, preserved all scored postal fields, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
- re-verified on 2026-03-20 in persistent sandbox with `name`, generic `email`, Norwegian `organizationNumber`, and `postalAddress` (`Fjordveien 129`, `2317`, `Hamar`); one `POST /customer` returned customer `id=108248251`, preserved the exact postal fields in `response.value.postalAddress`, and still needed no follow-up read
- re-verified on 2026-03-20 in production for the German-language prompt `Grünfeld GmbH`, `886669445`, `post@grunfeld.no`, and `Kirkegata 87, 6003 Ålesund`; one `POST /customer` returned customer `id=108268199`, preserved the exact Unicode name and city, and still needed no follow-up read
- re-verified again on 2026-03-20 in persistent sandbox with production-like German prompt semantics and unique payload `Grünfeld Reflection 201018 AS`, `post-reflection-201018@grunfeld.no`, `999201018`, and `postalAddress` `Kirkegata 87`, `6003`, `Ålesund`; the same single `POST /customer` returned customer `id=108268237`, preserved the exact Unicode name and city, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
- re-verified on 2026-03-20 in production for the French-language prompt `Colline SARL`, `939137599`, `post@colline.no`, and `Kirkegata 77, 4611 Kristiansand`; one `POST /customer` returned customer `id=108284978`, preserved the exact name, email, and postal fields, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
- re-verified on 2026-03-20 in persistent sandbox with production-like French prompt semantics and unique payload `Colline Reflection c833b15d SARL`, `post-reflection-c833b15d@colline.no`, `999833115`, and `postalAddress` `Kirkegata 77`, `4611`, `Kristiansand`; the same single `POST /customer` returned customer `id=108285083`, preserved the exact postal fields, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
- re-verified on 2026-03-20 in production for the Spanish-language prompt `Río Verde SL`, `919234830`, `post@rio.no`, and `Solveien 5, 4006 Stavanger`; one `POST /customer` returned customer `id=108285940`, preserved the exact accented Unicode name plus email and postal fields, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
- re-verified on 2026-03-20 in persistent sandbox with production-like Spanish prompt semantics and unique payload `Río Verde Reflection 017503 AS`, `post-reflection-017503@rio.no`, `999017503`, and `postalAddress` `Solveien 5`, `4006`, `Stavanger`; the same single `POST /customer` returned customer `id=108286045`, preserved the exact accented Unicode name and postal fields, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
