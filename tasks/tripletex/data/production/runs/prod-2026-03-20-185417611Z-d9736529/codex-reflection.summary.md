No. This run used `1` API call total, `0` 4xx. So score loss was not call-count/error driven.

Most likely missing field: `invoiceEmail`.

Evidence:
- prod run created supplier with `email="faktura@skogheim.no"` and `invoiceEmail=""`
- scorer returned `6/7`
- sandbox accepted same one-call `POST /supplier` with both:
  - `email="faktura-321000006@skogheim.no"`
  - `invoiceEmail="faktura-321000006@skogheim.no"`

Correct next path for this shape:
- still exactly `1` call: `POST /supplier`
- payload:
```json
{
  "name": "Skogheim AS",
  "organizationNumber": "993130494",
  "email": "faktura@skogheim.no",
  "invoiceEmail": "faktura@skogheim.no"
}
```

I updated docs/standards to reflect that supplier-specific rule and committed it:
- `6a4b0d5`
- `tripletex playbook: mirror invoice-looking supplier emails`