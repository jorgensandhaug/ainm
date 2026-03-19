# Tripletex API Surface Research

Date: 2026-03-19

## Main take

Fastest path to the entire public REST surface is Tripletex's OpenAPI spec, not manual docs scraping.

- Source of truth for REST surface: `https://tripletex.no/v2/openapi.json`
- Test env spec: `https://api-test.tripletex.tech/v2/openapi.json`
- Interactive docs: `https://tripletex.no/v2-docs`
- Practical docs: `https://developer.tripletex.no/`
- Changelog: `https://github.com/Tripletex/tripletex-api2/blob/master/changelog.md`

## Current snapshot

From prod spec on 2026-03-19:

- Version: `2.75.00`
- Paths: `548`
- Operations: `802`
- Methods: `GET 365`, `POST 165`, `PUT 180`, `DELETE 92`
- Operation tags: `190`
- Schemas: `2176`
- Action-style paths with `/:command`: `67`
- Deprecated operations: `4`

Prod and test specs are not byte-identical, but `.paths` and `.components.schemas` match exactly. Current diff appears to be environment metadata like server URL/base URL text, not API shape.

## What OpenAPI covers well

- Full endpoint/path inventory
- HTTP methods
- Operation ids
- Request/response schemas
- Deprecated markers
- Enough shape to generate SDKs or internal catalogs

## What OpenAPI does not fully cover

- Current live webhook event list. Webhook docs say to use `GET /event` for supported events.
- Entitlement/package gating. Tripletex notes some endpoints only exist for certain packages, and missing fields/no data can happen due to authorization.
- Workflow quirks from docs/FAQ, especially token creation, accountant access, and integration-marketplace approval flow.

## Recommended collection strategy

1. Use `scripts/tripletex_api_surface.sh` to snapshot the published OpenAPI spec into machine-readable inventories.
2. Treat `research/tripletex/operations.tsv` as the canonical REST endpoint list.
3. Layer on webhook surface separately from docs plus authenticated `GET /event`.
4. Layer on changelog monitoring so new endpoints/fields show up quickly.
5. Validate package/entitlement gated behavior with a real test account, since spec shape alone will overstate what every tenant can actually call.

## Notes from official docs

- Tripletex moved from Swagger v2 to OpenAPI v3 in `2.72.00` and points integrators to `https://tripletex.no/v2/openapi.json`.
- Developer docs say the OpenAPI docs are "always up-to-date".
- Webhooks are documented separately and managed under `/event` and `/event/subscription`.
- Authentication is Basic auth using `companyId-or-0:sessionToken`, where `sessionToken` comes from `/token/session/:create`.
- For marketplace approval, Tripletex reviews integrations and exposes consumer tokens after approval; privilege/entitlement planning is therefore likely part of any full-surface integration review.

## Immediate next steps

- Run authenticated discovery against a test account:
  - `GET /event` for actual live webhook event names
  - `GET /company/>withLoginAccess` if accountant-token support matters
- Build an entitlement map:
  - group operations by tag/resource
  - mark package-limited areas from changelog/docs
- Add a scheduled spec diff so new Tripletex releases automatically produce a changed endpoint/field report
