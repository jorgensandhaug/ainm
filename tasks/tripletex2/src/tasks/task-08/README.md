# Create And Send Invoice

Canonical task surface: `task.ts`

This task is the first production-quality vertical slice in `tripletex2` and has been **live-verified against a real Tripletex sandbox** (2026-03-20).

## Task-local front door

- `task.ts` exports the frozen front-door `task` object alongside the input interface and task-local strategy alias.
- `strategies/order-then-invoice-send.ts` implements a deterministic three-call solve program.
- `strategies/order-then-invoice-then-send.ts` keeps the same typed task surface but splits invoice creation from dispatch so the runtime can compare a real second candidate.
- `src/tasks/_template/` is the copyable scaffold that future task folders should start from.

## Strategy outlines

Both strategies now use `POST /invoice` with embedded `orders[]`, which is the proven live Tripletex API shape.

- `order-then-invoice-send.v1` (3 calls): `GET /customer` → `GET /ledger/vatType` → `POST /invoice?sendToCustomer=true` with embedded orders.
- `order-then-invoice-then-send.v1` (4 calls): `GET /customer` (including `invoiceSendMethod`) → `GET /ledger/vatType` → `POST /invoice?sendToCustomer=false` → `PUT /invoice/{id}/:send?sendType=...`.

## Key API learnings from live sandbox verification

- `POST /order` + `PUT /order/:invoice` does **not** work reliably in the live Tripletex sandbox. Use `POST /invoice` with embedded `orders[]` instead.
- `invoiceDueDate` is **required** by Tripletex — omitting it causes a 422 validation error (error code 18000).
- `vatType` must be resolved via `GET /ledger/vatType?typeOfVat=OUTGOING` and attached to order lines.
- The 3-call auto-send variant (`sendToCustomer=true` on `POST /invoice`) is currently the local leader.

## Why this shape

- The task surface is readable in one TypeScript file without jumping between interface and strategy files.
- `task.ts` also exposes the registry-facing loader, so the task stays discoverable through one explicit front door.
- The strategy still reads like a numbered API-call program executed by ordinary TypeScript.
- Future tasks can copy the same frozen shape without introducing a generator or extra framework layer.
