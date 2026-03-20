## Task
Post-run learning pass for the exact production run that created customer `Fjordkraft AS` with orgnr `843216285`, address `Fjordveien 129, 2317 Hamar`, email `post@fjordkraft.no`.

## Reflection
The original scored run went well. It matched the existing trusted standard exactly, used one `POST /customer`, reused the write response for verification, and stopped without wasting reads.

Nothing went poorly in the scored run itself. The only mistake in the follow-up investigation was my first sandbox test payload: I derived a “unique” organization number from a hex suffix, which produced letters and triggered `422 organizationNumber`. I corrected it once with a numeric-only orgnr and reran the same single-write path.

The correct approach for this task shape remains: send only `name`, `email`, `organizationNumber`, and `postalAddress` when one ordinary address is given; verify from `response.value`; ignore sparse `physicalAddress` linkback.

## Call Efficiency
The production run was minimal-call.

Wasted API calls in the production run: none.

Exact lower-call path for the next agent:
1. `POST /customer`
2. Stop after verifying `response.value.name`, `response.value.organizationNumber`, `response.value.email`, and `response.value.postalAddress.{addressLine1,postalCode,city}`

Calls that would have been unnecessary:
- `GET /customer` pre-read
- `GET /customer/{id}` follow-up read
- Any lookup for invoice delivery defaults
- Any extra read just because `physicalAddress` comes back as a sparse link object

## Root Causes
The scored run had no execution mistake; prior docs were already correct enough for this shape.

The only mistake in the learning pass came from weak local test-data generation: I used a hex-derived suffix for `organizationNumber` instead of digits-only. That is a sandbox script bug, not a Tripletex workflow issue.

## Sandbox Verification
Persistent sandbox base URL used: `https://kkpqfuj-amager.tripletex.dev/v2`.

Proof path:
- First sandbox attempt: `POST /customer` with non-numeric generated orgnr failed with `422`, validation on `organizationNumber`
- Corrected sandbox attempt: one `POST /customer` succeeded and returned customer `id=108248251`

Verified successful payload shape:
```json
{
  "name": "Codex Reflection 64b4936f AS",
  "email": "post-reflection-64b4936f@example.no",
  "organizationNumber": "999493664",
  "postalAddress": {
    "addressLine1": "Fjordveien 129",
    "postalCode": "2317",
    "city": "Hamar"
  }
}
```

Verified response facts:
- `response.value.postalAddress.addressLine1 = "Fjordveien 129"`
- `response.value.postalAddress.postalCode = "2317"`
- `response.value.postalAddress.city = "Hamar"`
- `response.value.physicalAddress` still came back as sparse auto-generated link-only object
- No follow-up `GET` was needed

## Playbook Changes
Updated existing files; no new trusted standard or playbook created.

Changed paths:
- [trusted-standards/common-endpoints.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md#L17)
- [trusted-standards/create-customer.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-customer.md#L70)
- [task-playbooks/create-customer.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-customer.md#L30)

What changed:
- Clarified in common endpoints that the one-call fast path still holds when one ordinary `postalAddress` is present
- Added explicit verification note that `response.value.postalAddress.*` is sufficient proof of the scored address fields
- Added a fresh 2026-03-20 sandbox re-verification entry for the exact `Fjordveien 129`, `2317`, `Hamar` address shape

## Commit
`aff6328f64bc24f1e8302f30dac79e8a4b9c1889`

`tripletex playbook: tighten create-customer fast path`

## Reusable Heuristics
- Exact Norwegian create-customer task with prompt-provided identity fields is a one-write task: `POST /customer`.
- If the prompt gives one ordinary street/mailing address, map it only to `postalAddress`; do not invent `physicalAddress`.
- Generic prompt email maps to `email`; do not add `invoiceEmail` unless explicitly requested.
- Trust the `201 {"value": ...}` body for verification; do not add a read if scored fields are already present.
- Sparse returned `physicalAddress` is normal and not evidence of missing payload.
- For sandbox uniqueness hacks, ensure generated `organizationNumber` is digits-only; do not burn extra calls on avoidable validation errors.