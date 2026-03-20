Found lower-call path: `5` calls, not `6`.

1. `GET /customer?organizationNumber=...&fields=*`
2. `GET /product?productNumber=<a>&productNumber=<b>&fields=*`
3. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
4. `POST /order`
5. `PUT /order/{id}/:invoice?invoiceDate=...&sendToCustomer=false&paymentTypeId=<id>&paidAmount=0.01&paymentTypeIdRestAmount=<same-id>`

The wasted call in the old flow was the separate `PUT /invoice/{id}/:payment`.

Sandbox proof:
- `paidAmount=0` failed with `422`; Tripletex treated it as missing.
- `paidAmount=0.01` plus `paymentTypeIdRestAmount=<same-id>` succeeded and returned outstanding `0` in the same invoice write.
- Proven on sandbox invoice `68` / id `2147537442` with `5` total calls.

Extra pitfall found:
- `GET /product?productNumber=...` can return the matched key under `number`, not `productNumber`. Resolver should normalize both.

I updated the docs here:
- [AGENTS.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md)
- [create-order-invoice-and-register-payment.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-order-invoice-and-register-payment.md)
- [common-endpoints.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md)
- [create-order-invoice-and-register-payment.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-order-invoice-and-register-payment.md)

If the same run already has a proven valid `paymentTypeId`, the path drops to `4` calls by skipping step 3.