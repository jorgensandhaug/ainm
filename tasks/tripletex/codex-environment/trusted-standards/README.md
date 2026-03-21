# Trusted Standards

**ABSOLUTE RULE: NO BETA API ENDPOINTS.** NEVER use any endpoint marked as beta in the OpenAPI spec. Beta endpoints ALWAYS return `403`. This includes `/incomingInvoice*`, `/bank/reconciliation*`, and any endpoint with `(BETA)` in its summary. Do not attempt, retry, explore, or use as fallback.

These are stricter than task playbooks.

Purpose:
- give the exact lowest-risk, lowest-call standard flow for the most common task shapes
- let the agent skip `./openapi.json` re-checking for exact trusted-standard matches
- reduce wasted time, random spec rummaging, and avoidable `4xx`

How to use:
- first check whether the task is an exact or near-exact match for one trusted standard
- if yes, use that standard directly
- do not re-check `./openapi.json` for an exact trusted-standard match unless the standard itself says to
- if the task materially differs, fall back to `./task-playbooks/`, then `./openapi.json`

When a reflection run should update a trusted standard:
- a standard task shape failed
- a lower-call or lower-error flow was proven
- a prerequisite or validation rule became clearer
- a current trusted standard was incomplete, wrong, or no longer the best path

Required structure for every trusted standard file:
- `# <Task Name>`
- `## Trust Level`
- `## Exact Match`
- `## Do Not Use This Standard If`
- `## Standard Flow`
- `## Payload Rules`
- `## Reuse From Write Response`
- `## Verification`
- `## Known Recovery Branches`
- `## OpenAPI / Sandbox Status`

Current trusted standards:
- `./trusted-standards/common-endpoints.md`
- `./trusted-standards/create-customer.md`
- `./trusted-standards/create-department.md`
- `./trusted-standards/create-product.md`
- `./trusted-standards/create-project.md`
- `./trusted-standards/create-employee.md`
- `./trusted-standards/create-customer-invoice.md`
- `./trusted-standards/register-receipt-expense-voucher.md`
- `./trusted-standards/register-customer-invoice-payment.md`
- `./trusted-standards/overdue-invoice-reminder-fee-and-partial-payment.md`
- `./trusted-standards/register-supplier-invoice.md`
