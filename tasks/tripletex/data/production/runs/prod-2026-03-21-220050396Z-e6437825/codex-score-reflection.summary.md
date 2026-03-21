# Score Reflection — prod-2026-03-21-220050396Z-e6437825

## 1. Task Attribution

- **Inference status:** ambiguous (3 candidates)
- **Candidate tasks:** 03 (T1, max 2), 09 (T2, max 4), 28 (T3, max 6)
- **Most likely attribution:** task 09 — its `last_attempt_after` (`2026-03-21T22:02:14`) is closest to our completion time (`2026-03-21T22:02:07`); also the "create customer invoice" shape is a T2-complexity task
- **Best score before/after:** all 3 candidates were already at tier max (03: 2/2, 09: 4/4, 28: 6/6) — best_score unchanged for all

## 2. Correctness Verdict

**Likely perfect.** The invoice was created with correct customer (Havbris AS / 924693576), correct product-linked lines (3296 at 5400, 6620 at 6850, 8441 at 13750), correct VAT types (25%/15%/0%), and correct totals (`amountExcludingVatCurrency=26000`, `amountCurrency=28377.5`). The best_score for the most likely task (09) remained at 4/4 (tier max), consistent with a perfect-correctness run that matched the existing best.

## 3. Efficiency Verdict

**Likely optimal.** The run used 6 API calls (3 core + 3 bank-account repair) with 0 avoidable errors. This matches the proven optimal 6-call path for the exact-number existing-product create-only invoice shape when the fresh account requires bank-account repair. No `/ledger/vatType` call was spent. No verification GET was spent. The best_score remaining at tier max is consistent with full efficiency credit.

If attributed to task 09 (T2, max 4):
- 4/4 is the likely score — perfect correctness + optimal efficiency on a well-established path
- Prior runs for this same task shape (Sierra SL 3 calls, Ridgepoint Ltd 6 calls, Montanha Lda 6 calls) all achieved max score

## 4. Likely Root Cause

No root cause to diagnose — the run was clean. The only 422 was the expected bank-account validation on a fresh account, which is not an avoidable error and was handled correctly in-script.

## 5. What Went Right

1. **Immediate execution** — read only the trusted standard, then wrote and ran the script. No time wasted on AGENTS.md, openapi.json, or multiple playbook reads.
2. **Comma-separated product query** — `GET /product?number=3296,6620,8441&fields=*` resolved all 3 products in one call (4th production confirmation of this approach).
3. **VAT reuse from products** — products carried `vatType.id` values 3/31/6 (25%/15%/0%), reused directly on invoice lines. No `/ledger/vatType` call needed.
4. **In-script bank-account repair** — the 422 was handled without re-reading customer or products, keeping the same payload on retry.
5. **In-script fallback logic** — included catalog-read fallback for product resolution even though it wasn't triggered; zero-cost insurance against partial results.
6. **Norwegian prompt handled naturally** — no special parsing or language detection needed.

## 6. What To Change Next Time

Nothing. This run represents the mature optimal path for this task shape:

1. `GET /customer?organizationNumber=...&fields=*`
2. `GET /product?number=X,Y,Z&fields=*` (comma-separated, OR semantics)
3. `POST /invoice?sendToCustomer=false` with `product: { id }` and `vatType: { id: product.vatType.id }`
4. If 422 bank-account → GET account → PUT repair → retry POST (adds exactly 3 calls)

The only theoretical improvement would be if the fresh account no longer required bank-account repair (reducing from 6 to 3 calls), but that is outside agent control.

Continue using this exact pattern for all future "create customer invoice with existing products by number" task shapes.
