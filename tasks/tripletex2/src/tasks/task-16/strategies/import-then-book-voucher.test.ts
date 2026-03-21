import assert from "node:assert/strict";
import test from "node:test";

import type {
  TripletexClient,
  TripletexRequestOptions,
} from "../../../runtime/contracts";
import { TripletexHttpError } from "../../../runtime/tripletex-client";
import { strategy } from "./import-then-book-voucher";

test("task 16 strategy falls back to supplier lookup when create returns a duplicate-style validation error", async () => {
  const calls: string[] = [];
  let capturedSupplierBody: unknown;

  const result = await strategy.run(
    createTripletexStub({
      async get(path, options) {
        calls.push(`GET ${path}`);

        if (path === "/supplier") {
          assert.deepEqual(options?.query, {
            organizationNumber: "889157917",
            fields: "*",
          });
          return {
            values: [
              {
                id: 108244534,
                name: "Elvdal AS",
                organizationNumber: "889157917",
                ledgerAccount: { id: 424190921 },
              },
            ],
          };
        }

        if (path === "/ledger/account") {
          return {
            values: [
              {
                id: 424191158,
                number: 6500,
                isApplicableForSupplierInvoice: true,
              },
            ],
          };
        }

        if (path === "/ledger/vatType") {
          return {
            values: [{ id: 1, number: "1", percentage: 25 }],
          };
        }

        throw new Error(`Unexpected GET ${path}`);
      },
      async post(path, options) {
        calls.push(`POST ${path}`);

        if (path === "/supplier") {
          capturedSupplierBody = options?.body;
          throw new TripletexHttpError({
            status: 422,
            path,
            message: "Supplier already exists.",
          });
        }

        if (path === "/ledger/voucher/importDocument") {
          assert.ok(options?.rawBody instanceof FormData);
          return {
            values: [{ id: 608856087, version: 4 }],
          };
        }

        throw new Error(`Unexpected POST ${path}`);
      },
      async put(path, options) {
        calls.push(`PUT ${path}`);

        if (path === "/ledger/voucher/608856087") {
          assert.deepEqual(options?.query, { sendToLedger: false });
          return {
            value: createVoucherResponse({
              voucherId: 608856087,
              expenseAccountId: 424191158,
              supplierId: 108244534,
              supplierLedgerAccountId: 424190921,
              vatTypeId: 1,
              invoiceNumber: "INV-2026-8662",
              dueDate: "2026-03-20",
              netAmount: 31800,
              grossAmount: 39750,
              vatAmount: 7950,
            }),
          };
        }

        throw new Error(`Unexpected PUT ${path}`);
      },
    }),
    {
      supplierName: "Elvdal AS",
      organizationNumber: "889 157 917",
      invoiceNumber: "INV-2026-8662",
      lineDescription: "kontortenester",
      grossAmountNok: 39750,
      expenseAccountNumber: 6500,
      vatRatePercent: 25,
      invoiceDate: "2026-03-20",
    },
  );

  assert.deepEqual(capturedSupplierBody, {
    name: "Elvdal AS",
    organizationNumber: "889157917",
  });
  assert.deepEqual(calls, [
    "POST /supplier",
    "GET /supplier",
    "GET /ledger/account",
    "GET /ledger/vatType",
    "POST /ledger/voucher/importDocument",
    "PUT /ledger/voucher/608856087",
  ]);
  assert.deepEqual(result.createdEntityIds, {
    supplierId: 108244534,
    voucherId: 608856087,
  });
  assert.equal(result.verification?.netAmount, 31800);
  assert.equal(result.verification?.sendToLedgerRequested, false);
});

test("task 16 strategy rethrows non-duplicate supplier validation failures", async () => {
  let supplierLookupAttempts = 0;

  await assert.rejects(
    strategy.run(
      createTripletexStub({
        async get(path) {
          if (path === "/supplier") {
            supplierLookupAttempts += 1;
          }
          throw new Error(`Unexpected GET ${path}`);
        },
        async post(path) {
          if (path === "/supplier") {
            throw new TripletexHttpError({
              status: 422,
              path,
              message: "Organization number is invalid.",
            });
          }

          throw new Error(`Unexpected POST ${path}`);
        },
      }),
      {
        supplierName: "Elvdal AS",
        organizationNumber: "889157917",
        invoiceNumber: "INV-2026-8662",
        lineDescription: "kontortenester",
        grossAmountNok: 39750,
        expenseAccountNumber: 6500,
        vatRatePercent: 25,
        invoiceDate: "2026-03-20",
      },
    ),
    /Organization number is invalid\./,
  );

  assert.equal(supplierLookupAttempts, 0);
});

test("task 16 strategy recovers from a create conflict after the existing-supplier lookup returns zero hits", async () => {
  const calls: string[] = [];
  let supplierLookupCount = 0;

  const result = await strategy.run(
    createTripletexStub({
      async get(path) {
        calls.push(`GET ${path}`);

        if (path === "/supplier") {
          supplierLookupCount += 1;
          if (supplierLookupCount === 1) {
            return { values: [] };
          }

          return {
            values: [
              {
                id: 108244534,
                name: "Elvdal AS",
                organizationNumber: "889157917",
                ledgerAccount: { id: 424190921 },
              },
            ],
          };
        }

        if (path === "/ledger/account") {
          return {
            values: [
              {
                id: 424191158,
                number: 6500,
                isApplicableForSupplierInvoice: true,
              },
            ],
          };
        }

        if (path === "/ledger/vatType") {
          return {
            values: [{ id: 1, number: "1", percentage: 25 }],
          };
        }

        throw new Error(`Unexpected GET ${path}`);
      },
      async post(path, options) {
        calls.push(`POST ${path}`);

        if (path === "/supplier") {
          assert.deepEqual(options?.body, {
            name: "Elvdal AS",
            organizationNumber: "889157917",
          });
          throw new TripletexHttpError({
            status: 409,
            path,
            message: "Conflict",
          });
        }

        if (path === "/ledger/voucher/importDocument") {
          return {
            values: [{ id: 608856087, version: 4 }],
          };
        }

        throw new Error(`Unexpected POST ${path}`);
      },
      async put(path) {
        calls.push(`PUT ${path}`);

        if (path === "/ledger/voucher/608856087") {
          return {
            value: createVoucherResponse({
              voucherId: 608856087,
              expenseAccountId: 424191158,
              supplierId: 108244534,
              supplierLedgerAccountId: 424190921,
              vatTypeId: 1,
              invoiceNumber: "INV-2026-8662",
              dueDate: "2026-03-20",
              netAmount: 31800,
              grossAmount: 39750,
              vatAmount: 7950,
            }),
          };
        }

        throw new Error(`Unexpected PUT ${path}`);
      },
    }),
    {
      supplierName: "Elvdal AS",
      organizationNumber: "889157917",
      invoiceNumber: "INV-2026-8662",
      lineDescription: "kontortenester",
      grossAmountNok: 39750,
      expenseAccountNumber: 6500,
      vatRatePercent: 25,
      invoiceDate: "2026-03-20",
      supplierAlreadyExists: true,
    },
  );

  assert.deepEqual(calls, [
    "GET /supplier",
    "POST /supplier",
    "GET /supplier",
    "GET /ledger/account",
    "GET /ledger/vatType",
    "POST /ledger/voucher/importDocument",
    "PUT /ledger/voucher/608856087",
  ]);
  assert.deepEqual(result.createdEntityIds, {
    supplierId: 108244534,
    voucherId: 608856087,
  });
});

test("task 16 strategy fails before voucher update when the import response omits version", async () => {
  let putAttempts = 0;

  await assert.rejects(
    strategy.run(
      createTripletexStub({
        async get(path) {
          if (path === "/ledger/account") {
            return {
              values: [
                {
                  id: 424191158,
                  number: 6500,
                  isApplicableForSupplierInvoice: true,
                },
              ],
            };
          }

          if (path === "/ledger/vatType") {
            return {
              values: [{ id: 1, number: "1", percentage: 25 }],
            };
          }

          throw new Error(`Unexpected GET ${path}`);
        },
        async post(path) {
          if (path === "/supplier") {
            return {
              value: {
                id: 108244534,
                ledgerAccount: { id: 424190921 },
              },
            };
          }

          if (path === "/ledger/voucher/importDocument") {
            return {
              values: [{ id: 608856087 }],
            };
          }

          throw new Error(`Unexpected POST ${path}`);
        },
        async put(path) {
          putAttempts += 1;
          throw new Error(`Unexpected PUT ${path}`);
        },
      }),
      {
        supplierName: "Elvdal AS",
        organizationNumber: "889157917",
        invoiceNumber: "INV-2026-8662",
        lineDescription: "kontortenester",
        grossAmountNok: 39750,
        expenseAccountNumber: 6500,
        vatRatePercent: 25,
        invoiceDate: "2026-03-20",
      },
    ),
    /Tripletex did not return imported voucher version\./,
  );

  assert.equal(putAttempts, 0);
});

function createTripletexStub(handlers: {
  get?: (
    path: string,
    options?: TripletexRequestOptions,
  ) => Promise<unknown>;
  post?: (
    path: string,
    options?: TripletexRequestOptions,
  ) => Promise<unknown>;
  put?: (
    path: string,
    options?: TripletexRequestOptions,
  ) => Promise<unknown>;
}): { clock: { today(): string }; tripletex: TripletexClient } {
  return {
    clock: {
      today() {
        return "2026-03-20";
      },
    },
    tripletex: {
      async get<TResponse>(path: string, options?: TripletexRequestOptions) {
        if (!handlers.get) {
          throw new Error(`Unexpected GET ${path}`);
        }

        return (await handlers.get(path, options)) as TResponse;
      },
      async post<TResponse>(path: string, options?: TripletexRequestOptions) {
        if (!handlers.post) {
          throw new Error(`Unexpected POST ${path}`);
        }

        return (await handlers.post(path, options)) as TResponse;
      },
      async put<TResponse>(path: string, options?: TripletexRequestOptions) {
        if (!handlers.put) {
          throw new Error(`Unexpected PUT ${path}`);
        }

        return (await handlers.put(path, options)) as TResponse;
      },
    },
  };
}

function createVoucherResponse(input: {
  voucherId: number;
  expenseAccountId: number;
  supplierId: number;
  supplierLedgerAccountId: number;
  vatTypeId: number;
  invoiceNumber: string;
  dueDate: string;
  netAmount: number;
  grossAmount: number;
  vatAmount: number;
}) {
  return {
    id: input.voucherId,
    postings: [
      {
        row: 1,
        amount: input.netAmount,
        amountGross: input.grossAmount,
        account: { id: input.expenseAccountId },
        vatType: { id: input.vatTypeId },
      },
      {
        row: 2,
        amount: -input.grossAmount,
        amountGross: -input.grossAmount,
        invoiceNumber: input.invoiceNumber,
        termOfPayment: input.dueDate,
        account: { id: input.supplierLedgerAccountId },
        supplier: { id: input.supplierId },
      },
      {
        row: 3,
        amount: input.vatAmount,
        amountGross: input.vatAmount,
        account: { id: 424190999 },
      },
    ],
  };
}
