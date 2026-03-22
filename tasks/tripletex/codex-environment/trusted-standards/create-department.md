# Create Department

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- create one or more new departments
- prompt directly provides department names
- no update/delete/lookup flow
- prompt language does not matter for this shape; German, Norwegian, Spanish, French, etc. still use the same endpoint choice

## Do Not Use This Standard If
- prompt requires modifying existing departments
- prompt depends on department manager or other linked objects
- task is not a pure create

## Standard Flow
1. if one department: `POST /department`
2. if several departments: `POST /department/list` once with the full array
3. verify directly from write response
4. stop

For exact multi-department creates, this one batch write is the call floor: there is no lower-call valid path than one `POST /department/list`.

For exact matches, do not spend extra time re-reading `./trusted-standards/common-endpoints.md` or `./openapi.json`; this standard already fixes the winning endpoint and payload shape.

## Payload Rules
- one department:
  - `{ "name": "..." }`
- many departments:
  - `[{"name":"..."}, ...]`
- preserve department names exactly, including non-ASCII letters such as `Ø`
- do not invent `departmentNumber`
- do not invent `departmentManager`

## Reuse From Write Response
- `value.id` or `values[].id`
- returned `name`, `displayName`, `isInactive`

## Verification
- zero extra calls by default
- trust `201` write wrapper
- for batch create, trust `values[]`
- do not reject a successful batch write just because top-level `fullResultSize` is `0`
- do not add a follow-up `GET /department` or split the work into repeated `POST /department` calls for a plain multi-create prompt

## Known Recovery Branches
- none for the standard create shape

## OpenAPI / Sandbox Status
- `/department` and `/department/list` verified in `./openapi.json`
- sandbox-proven for one-call single and one-call batch create
- batch create returns `fullResultSize=0` with correct `values[]`; verify from `values[]`, not metadata
- Unicode department names survive batch write unchanged
- production-proven across German, Spanish, Norwegian, Portuguese, and mixed-language prompts (2026-03-20 and 2026-03-21)
- all production runs scored 7/7 (normalized 2) with one `POST /department/list`, zero reads, zero errors
- production re-confirmed on 2026-03-21 with a German three-department prompt for `Logistikk`, `Salg`, and `Drift`: one `POST /department/list`, 201, 7/7 score (normalized 2), zero errors
- production re-confirmed on 2026-03-21 with a Nynorsk three-department prompt for `Produksjon`, `Lager`, and `Kvalitetskontroll`: one `POST /department/list`, 201, 7/7 score (normalized 2), zero errors
- sandbox re-verified on 2026-03-21 with `Produksjon Reflection 20260321-173420`, `Lager Reflection 20260321-173420`, and `Kvalitetskontroll Reflection 20260321-173420`: one `POST /department/list`, 201, correct `values[]`
- production re-confirmed on 2026-03-21 with a Nynorsk three-department prompt for `Produksjon`, `Kvalitetskontroll`, and `HR`: one `POST /department/list`, 201, 1 call 0 errors; confirms short ASCII-only names like `HR` need no special handling
- production re-confirmed on 2026-03-21 with a Spanish three-department prompt for `Utvikling`, `Kvalitetskontroll`, and `Markedsføring`: one `POST /department/list`, 201, 7/7 score (normalized 2), 1 call 0 errors; confirms `ø` in `Markedsføring` preserved correctly and Spanish prompt language triggers no endpoint deviation
- production re-confirmed on 2026-03-21 with a Spanish three-department prompt for `Lager`, `Økonomi`, and `Drift` (2d9b6947): one `POST /department/list`, 201, 7/7 score (normalized 2), 1 call 0 errors; second Spanish confirmation with `Ø` in department name
- production re-confirmed on 2026-03-22 with a Norwegian three-department prompt for `HR`, `Salg`, and `Økonomi` (e78d62fc): one `POST /department/list`, 201, 1 call 0 errors; sandbox re-verified same day
- production re-confirmed on 2026-03-22 with a Nynorsk three-department prompt for `Logistikk`, `Kundeservice`, and `HR` (fc039efb): one `POST /department/list`, 201, 1 call 0 errors; sandbox re-verified same day
