# Trusted Standards

These files are copied into `tripletex2` as reference docs for coding agents implementing deterministic strategies. They are not runtime code.

In strategy work, consult these first when a task appears to match a known low-risk, low-call flow closely enough to justify a standard path.

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
- `./common-endpoints.md`
- `./create-customer.md`
- `./create-department.md`
- `./create-product.md`
- `./create-project.md`
- `./create-employee.md`
- `./create-customer-invoice.md`
- `./register-customer-invoice-payment.md`
- `./register-supplier-invoice.md`
