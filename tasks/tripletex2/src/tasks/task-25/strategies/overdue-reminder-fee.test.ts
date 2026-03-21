import assert from "node:assert/strict";
import test from "node:test";

import type {
  TripletexClient,
  TripletexRequestOptions,
} from "../../../runtime/contracts";
import { TripletexHttpError } from "../../../runtime/tripletex-client";
import { strategy } from "./overdue-reminder-fee";

test("task 25 strategy posts the reminder fee, sends the fee invoice, and registers the fixed partial payment", async () => {
  const getCalls: Array<{ path: string; query?: Record<string, unknown> }> = [];
  const postCalls: Array<{
    path: string;
    query?: Record<string, unknown>;
    body?: unknown;
  }> = [];
  const putCalls: Array<{
    path: string;
    query?: Record<string, unknown>;
    body?: unknown;
  }> = [];

  const result = await strategy.run(
    createTripletexStub({
      async get(path, options) {
        getCalls.push({
          path,
          query: options?.query as Record<string, unknown> | undefined,
        });

        if (path === "/invoice") {
          return {
            values: [
              {
                id: 5001,
                invoiceNumber: 31045,
                invoiceDueDate: "2026-03-10",
                amountCurrencyOutstanding: 7500,
                customer: {
                  id: 7001,
                },
              },
              {
                id: 5002,
                invoiceNumber: 31046,
                invoiceDueDate: "2026-03-28",
                amountCurrencyOutstanding: 9900,
                customer: {
                  id: 7002,
                },
              },
            ],
          };
        }

        if (path === "/invoice/paymentType") {
          return {
            values: [
              {
                id: 41,
                debitAccount: {
                  number: 3000,
                  isBankAccount: false,
                  isInvoiceAccount: false,
                },
                creditAccount: {
                  number: 1500,
                },
              },
              {
                id: 42,
                debitAccount: {
                  number: 1920,
                  isBankAccount: true,
                  isInvoiceAccount: true,
                },
                creditAccount: null,
              },
            ],
          };
        }

        if (
          path === "/ledger/account" &&
          String(options?.query?.number) === "1500,3400"
        ) {
          return {
            values: [
              {
                id: 15001,
                number: 1500,
              },
              {
                id: 34001,
                number: 3400,
              },
            ],
          };
        }

        throw new Error(`Unexpected GET ${path}`);
      },
      async post(path, options) {
        postCalls.push({
          path,
          query: options?.query as Record<string, unknown> | undefined,
          body: options?.body,
        });

        if (path === "/ledger/voucher") {
          return {
            value: {
              id: 88001,
              number: 901,
            },
          };
        }

        if (path === "/invoice") {
          return {
            value: {
              id: 99001,
              invoiceNumber: 41001,
              amountCurrency: 50,
            },
          };
        }

        throw new Error(`Unexpected POST ${path}`);
      },
      async put(path, options) {
        putCalls.push({
          path,
          query: options?.query as Record<string, unknown> | undefined,
          body: options?.body,
        });

        if (path === "/invoice/5001/:payment") {
          return {
            value: {
              id: 5001,
              amountCurrencyOutstanding: 2500,
            },
          };
        }

        throw new Error(`Unexpected PUT ${path}`);
      },
    }),
    {},
  );

  assert.deepEqual(getCalls, [
    {
      path: "/invoice",
      query: {
        invoiceDateFrom: "1900-01-01",
        invoiceDateTo: "2100-12-31",
        count: 1000,
        sorting: "-invoiceDate",
        fields: "*,customer(*)",
      },
    },
    {
      path: "/invoice/paymentType",
      query: {
        count: 1000,
        fields: "*,debitAccount(*),creditAccount(*)",
      },
    },
    {
      path: "/ledger/account",
      query: {
        number: "1500,3400",
        fields: "*",
      },
    },
  ]);
  assert.equal(postCalls.length, 2);
  assert.deepEqual(postCalls[0], {
    path: "/ledger/voucher",
    query: undefined,
    body: {
      date: "2026-03-21",
      description: "Purregebyr 31045",
      voucherType: null,
      postings: [
        {
          row: 1,
          date: "2026-03-21",
          description: "Purregebyr 31045",
          account: { id: 15001 },
          customer: { id: 7001 },
          currency: { id: 1 },
          amount: 50,
          amountCurrency: 50,
          amountGross: 50,
          amountGrossCurrency: 50,
        },
        {
          row: 2,
          date: "2026-03-21",
          description: "Purregebyr 31045",
          account: { id: 34001 },
          currency: { id: 1 },
          amount: -50,
          amountCurrency: -50,
          amountGross: -50,
          amountGrossCurrency: -50,
        },
      ],
    },
  });
  assert.deepEqual(postCalls[1], {
    path: "/invoice",
    query: {
      sendToCustomer: true,
    },
    body: {
      invoiceDate: "2026-03-21",
      invoiceDueDate: "2026-03-21",
      customer: { id: 7001 },
      orders: [
        {
          customer: { id: 7001 },
          orderDate: "2026-03-21",
          deliveryDate: "2026-03-21",
          orderLines: [
            {
              description: "Purregebyr",
              count: 1,
              unitPriceExcludingVatCurrency: 50,
            },
          ],
        },
      ],
    },
  });
  assert.deepEqual(putCalls, [
    {
      path: "/invoice/5001/:payment",
      query: {
        paymentDate: "2026-03-21",
        paymentTypeId: 42,
        paidAmount: 5000,
      },
      body: undefined,
    },
  ]);
  assert.equal((result as { status?: string }).status, "completed");
  assert.deepEqual(result.createdEntityIds, {
    customerId: 7001,
    voucherId: 88001,
    feeInvoiceId: 99001,
  });
  assert.equal(result.verification?.remainingOutstanding, 2500);
  assert.equal(result.verification?.sendToCustomerRequested, true);
  assert.equal(result.verification?.usedBankAccountRepair, false);
});

test("task 25 strategy repairs the company bank account and retries the fee invoice write once", async () => {
  const getCalls: Array<{ path: string; query?: Record<string, unknown> }> = [];
  const postCalls: Array<{
    path: string;
    query?: Record<string, unknown>;
    body?: unknown;
  }> = [];
  const putCalls: Array<{
    path: string;
    query?: Record<string, unknown>;
    body?: unknown;
  }> = [];
  let invoiceAttemptCount = 0;

  const result = await strategy.run(
    createTripletexStub({
      async get(path, options) {
        getCalls.push({
          path,
          query: options?.query as Record<string, unknown> | undefined,
        });

        if (path === "/invoice") {
          return {
            values: [
              {
                id: 6001,
                invoiceNumber: 32045,
                invoiceDueDate: "2026-03-01",
                amountCurrencyOutstanding: 6400,
                customer: {
                  id: 7101,
                },
              },
            ],
          };
        }

        if (path === "/invoice/paymentType") {
          return {
            values: [
              {
                id: 52,
                debitAccount: {
                  number: 1920,
                  isBankAccount: true,
                  isInvoiceAccount: true,
                },
                creditAccount: null,
              },
            ],
          };
        }

        if (
          path === "/ledger/account" &&
          String(options?.query?.number) === "1500,3400"
        ) {
          return {
            values: [
              {
                id: 15101,
                number: 1500,
              },
              {
                id: 34101,
                number: 3400,
              },
            ],
          };
        }

        if (
          path === "/ledger/account" &&
          options?.query?.isBankAccount === true
        ) {
          return {
            values: [
              {
                id: 91001,
                number: 1920,
                isBankAccount: true,
                isInvoiceAccount: true,
                version: 3,
              },
            ],
          };
        }

        throw new Error(`Unexpected GET ${path}`);
      },
      async post(path, options) {
        postCalls.push({
          path,
          query: options?.query as Record<string, unknown> | undefined,
          body: options?.body,
        });

        if (path === "/ledger/voucher") {
          return {
            value: {
              id: 98001,
              number: 902,
            },
          };
        }

        if (path === "/invoice") {
          invoiceAttemptCount += 1;
          if (invoiceAttemptCount === 1) {
            throw new TripletexHttpError({
              path: "/invoice",
              status: 422,
              message:
                "Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.",
            });
          }

          return {
            value: {
              id: 99501,
              invoiceNumber: 42001,
              amountCurrency: 50,
            },
          };
        }

        throw new Error(`Unexpected POST ${path}`);
      },
      async put(path, options) {
        putCalls.push({
          path,
          query: options?.query as Record<string, unknown> | undefined,
          body: options?.body,
        });

        if (path === "/ledger/account/91001") {
          return {
            value: {
              id: 91001,
            },
          };
        }

        if (path === "/invoice/6001/:payment") {
          return {
            value: {
              id: 6001,
              amountCurrencyOutstanding: 1400,
            },
          };
        }

        throw new Error(`Unexpected PUT ${path}`);
      },
    }),
    {},
  );

  assert.equal(invoiceAttemptCount, 2);
  assert.deepEqual(getCalls, [
    {
      path: "/invoice",
      query: {
        invoiceDateFrom: "1900-01-01",
        invoiceDateTo: "2100-12-31",
        count: 1000,
        sorting: "-invoiceDate",
        fields: "*,customer(*)",
      },
    },
    {
      path: "/invoice/paymentType",
      query: {
        count: 1000,
        fields: "*,debitAccount(*),creditAccount(*)",
      },
    },
    {
      path: "/ledger/account",
      query: {
        number: "1500,3400",
        fields: "*",
      },
    },
    {
      path: "/ledger/account",
      query: {
        isBankAccount: true,
        fields: "*",
      },
    },
  ]);
  assert.equal(postCalls.filter((call) => call.path === "/invoice").length, 2);
  assert.deepEqual(putCalls, [
    {
      path: "/ledger/account/91001",
      query: undefined,
      body: {
        id: 91001,
        version: 3,
        bankAccountNumber: "12345678903",
      },
    },
    {
      path: "/invoice/6001/:payment",
      query: {
        paymentDate: "2026-03-21",
        paymentTypeId: 52,
        paidAmount: 5000,
      },
      body: undefined,
    },
  ]);
  assert.equal((result as { status?: string }).status, "completed");
  assert.deepEqual(result.notes, [
    "Tripletex required a company bank account before sending the reminder-fee invoice, so the strategy repaired one bank account and retried the same invoice write.",
  ]);
  assert.equal(result.verification?.usedBankAccountRepair, true);
  assert.equal(result.verification?.remainingOutstanding, 1400);
});

function createTripletexStub(handlers: {
  get(path: string, options?: TripletexRequestOptions): Promise<unknown>;
  post(path: string, options?: TripletexRequestOptions): Promise<unknown>;
  put(path: string, options?: TripletexRequestOptions): Promise<unknown>;
}): { clock: { today(): string }; tripletex: TripletexClient } {
  return {
    clock: {
      today() {
        return "2026-03-21";
      },
    },
    tripletex: {
      async get<TResponse>(path: string, options?: TripletexRequestOptions) {
        return (await handlers.get(path, options)) as TResponse;
      },
      async post<TResponse>(path: string, options?: TripletexRequestOptions) {
        return (await handlers.post(path, options)) as TResponse;
      },
      async put<TResponse>(path: string, options?: TripletexRequestOptions) {
        return (await handlers.put(path, options)) as TResponse;
      },
    },
  };
}
