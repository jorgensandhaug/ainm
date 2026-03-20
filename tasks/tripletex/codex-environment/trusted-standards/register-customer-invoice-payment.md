# Register Customer Invoice Payment

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- register full payment on one existing outgoing customer invoice
- prompt identifies the invoice strongly enough to find it in one decisive read
- no need to create the invoice first in the same task

## Do Not Use This Standard If
- task includes creating the order/invoice first
- task is supplier invoice payment
- prompt is too ambiguous to identify one invoice safely

## Standard Flow
1. `GET /invoice?...&fields=*` to identify the exact unpaid invoice
2. `GET /invoice/paymentType?fields=*` only if needed to resolve a valid incoming payment type
3. `PUT /invoice/{id}/:payment`
4. verify from payment write response
5. stop

## Payload Rules
- identify invoice by prompt identifiers, not by guessing
- when paying, use actual outstanding amount from invoice object
- do not use the prompt lookup amount if the live outstanding amount differs
- normalize payment-type account numbers before heuristic matching
- acceptable incoming payment types can have `creditAccount=null`

## Reuse From Write Response
- invoice id from locate step
- outstanding amount from invoice locate step
- post-payment remaining amount from write response

## Verification
- default verification is zero extra calls after payment write if response proves `amountOutstanding=0` or equivalent final state

## Known Recovery Branches
- if a larger multi-step flow already created order/invoice but failed before payment, resume at invoice locate step, do not rebuild earlier objects

## OpenAPI / Sandbox Status
- `/invoice/{id}/:payment` verified in `./openapi.json`
- locate-and-pay flow proven in existing payment playbook
