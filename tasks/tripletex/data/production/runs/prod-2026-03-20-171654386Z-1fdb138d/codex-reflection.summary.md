Likely miss: `invoiceEmail`.

What prompt said:
- register supplier `Bergvik AS`
- set `organizationNumber=852000139`
- set email `faktura@bergvik.no`

What I actually uploaded in production:
```json
{
  "name": "Bergvik AS",
  "organizationNumber": "852000139",
  "email": "faktura@bergvik.no"
}
```

What I did not upload:
- `invoiceEmail`

Why this is most likely the lost point:
- `Supplier` has separate `email` and `invoiceEmail` fields in [openapi.json](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/openapi.json).
- Sandbox proved they are independent fields:
  - email-only create -> `email="..."`, `invoiceEmail=""`
  - email+invoiceEmail create -> both persisted
  - invoiceEmail-only create -> `email=""`, `invoiceEmail="..."`

Sandbox proof:
- email only:
  - `POST /supplier` with `email=faktura-321654386@example.no`
  - result: `email=faktura-321654386@example.no`, `invoiceEmail=""`
- email + invoiceEmail:
  - result: both fields set to `faktura-321654387@example.no`
- invoiceEmail only:
  - result: `email=""`, `invoiceEmail=faktura-321654388@example.no`

Conclusion:
- I interpreted `E-post:` as generic contact email only.
- For supplier prompts, especially with invoice-looking address `faktura@...`, safest interpretation is likely to send both:
```json
{
  "name": "Bergvik AS",
  "organizationNumber": "852000139",
  "email": "faktura@bergvik.no",
  "invoiceEmail": "faktura@bergvik.no"
}
```

Less likely misses:
- not address fields; API auto-created sparse address links even when none sent
- not `isSupplier`; auto/read-only
- not org number/name/email; those were definitely written

So: told to register supplier with that email; likely failed point because I did not also persist that same address into `invoiceEmail`.