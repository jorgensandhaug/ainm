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
- if the prompt requests a description or documentation text, add `description` (free-text string, multiline OK, Unicode preserved)
- `email` is NOT required — omit it if the prompt does not provide one; Tripletex defaults it to `""`
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

## Verification (GETs are FREE — use them)
GETs do not count against the score. After the write, verify:

```
GET /customer/{id}?fields=*
```
Log: id, name, email, organizationNumber, postalAddress, physicalAddress, invoiceSendMethod, description. Confirm all scored fields match the prompt.

**Address expansion note**: `GET /customer/{id}?fields=*` returns `postalAddress` as a sparse link (id/url only, no addressLine1/postalCode/city). For full address verification on readback, use `fields=*,postalAddress(*)`. However, the `POST /customer` 201 response already includes the fully expanded postalAddress, so the POST response is preferred for address field verification.

The `201` response body also proves state, but the readback GET provides complete confirmation.

## Known Recovery Branches
- customer delivery validation if prompt explicitly implies EHF/invoice delivery constraints
- country/address consistency for foreign organization numbers

## Pitfalls To Avoid
- do not add duplicate-check logic for fresh-account create tasks
- do not invent `invoiceSendMethod`, `invoiceEmail`, or `physicalAddress` for the standard `name` + `email` + `organizationNumber` prompt shape
- do not treat the returned default delivery fields as a reason to fetch the customer again
- do not escalate to foreign-customer handling just because the prompt text is not Norwegian if the actual organization number and postal address are ordinary Norwegian values
- do not invent `email` when the prompt does not provide one; Tripletex accepts the customer without it

## Description Field Variant
- some prompts ask for a `description` field with documentation text, handover notes, or other free-text content
- `description` is a standard string field on the Customer schema — multiline content and special characters (Unicode, em-dash, euro sign) are preserved exactly
- the same one-call `POST /customer` path applies; `description` does not change the flow
- the POST response body includes the full `description` text, so no follow-up GET is needed to verify it
- re-verified on 2026-03-22 in production: `POST /customer` with `name` + `organizationNumber` + `description` (2706 chars, multiline) returned 201 with all fields preserved; 1 call 0 errors
- re-verified on 2026-03-22 in persistent sandbox: same shape with multiline content and special chars (æøå, em-dash, euro); description preserved exactly in both POST response and follow-up GET

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
- re-verified on 2026-03-21 in production for the Portuguese-language prompt `Porto Alegre Lda`, `834147254`, `post@porto.no`, and `Storgata 65, 4611 Kristiansand`; one `POST /customer` returned customer `id=108436350`, 7/7 checks passed, preserved all scored fields, 1 call 0 errors
- re-verified on 2026-03-21 in persistent sandbox with production-like Portuguese prompt semantics and unique payload `Porto Alegre Reflection 92322c6b Lda`, `post-reflection-92322c6b@porto.no`, `999923226`, and `postalAddress` `Storgata 65`, `4611`, `Kristiansand`; the same single `POST /customer` returned customer `id=108436730`, preserved all postal fields, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
- re-verified on 2026-03-21 in production for the Norwegian-language prompt `Nordlys AS`, `951285463`, `post@nordlys.no`, and `Parkveien 45, 5003 Bergen`; one `POST /customer` returned customer `id=108442350`, preserved all scored fields including postal address, 1 call 0 errors
- re-verified on 2026-03-21 in persistent sandbox with unique payload `Nordlys Reflection b2cb8ce1 AS`, `post-reflection-b2cb8ce1@nordlys.no`, `999828211`, and `postalAddress` `Parkveien 45`, `5003`, `Bergen`; the same single `POST /customer` returned customer `id=108442597`, preserved all postal fields, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
- re-verified on 2026-03-21 in production for the Portuguese-language prompt `Floresta Lda`, `893475656`, `post@floresta.no`, and `Kirkegata 132, 7010 Trondheim`; one `POST /customer` returned customer `id=108442473`, 1 call 0 errors, all scored fields preserved
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
- re-verified on 2026-03-22 in production for the Portuguese-language prompt `Oceano Lda`, `945727098`, `post@oceano.no`, and `Industriveien 56, 4611 Kristiansand`; one `POST /customer` returned customer `id=108587209`, preserved all scored fields including postal address, 1 call 0 errors
- re-verified on 2026-03-22 in persistent sandbox with unique payload `Oceano Reflection f7493600 Lda`, `post-reflection-f7493600@oceano.no`, `999749360`, and `postalAddress` `Industriveien 56`, `4611`, `Kristiansand`; the same single `POST /customer` returned customer `id=108587634`, preserved all postal fields, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
- re-verified on 2026-03-22 in production for the English-language prompt `Oakwood Ltd`, `980094863`, `post@oakwood.no`, and `Torggata 10, 6003 Ålesund`; one `POST /customer` returned customer `id=108606814`, preserved all scored fields including Unicode city `Ålesund`, 1 write + 1 verification GET, 0 errors; confirmed that `GET /customer/{id}?fields=*` returns postalAddress as sparse link while POST 201 response includes fully expanded postalAddress
- re-verified on 2026-03-22 in persistent sandbox with unique payload `Oakwood Reflection 658671 Ltd`, `post-reflection-658671@oakwood.no`, `999658671`, and `postalAddress` `Torggata 10`, `6003`, `Ålesund`; the same single `POST /customer` returned customer `id=108607088`, preserved all postal fields in POST response, confirmed GET sparse-link behavior for postalAddress
- re-verified on 2026-03-22 in production for the Norwegian-language prompt `Fjordkraft AS`, `843216285`, `post@fjordkraft.no`, and `Fjordveien 129, 2317 Hamar`; one `POST /customer` returned customer `id=108607970`, preserved all scored fields including postal address, 1 write + 1 verification GET, 0 errors
- re-verified on 2026-03-22 in persistent sandbox with unique payload `Fjordkraft Reflection 84katn AS`, `post-reflection-84katn@fjordkraft.no`, `999840000`, and `postalAddress` `Fjordveien 129`, `2317`, `Hamar`; the same single `POST /customer` returned customer `id=108608468`, preserved all postal fields, auto-returned a sparse `physicalAddress` link, and still needed no follow-up read
