import assert from "node:assert/strict";
import test from "node:test";

import type {
  TripletexClient,
  TripletexRequestOptions,
} from "../../../runtime/contracts";
import { TripletexHttpError } from "../../../runtime/tripletex-client";
import { strategy } from "./order-invoice-combined-payment";

test("task 11 strategy invoices first, repairs a missing bank account once, then pays the live outstanding amount", async () => {
  const getCalls: Array<{ path: string; query?: Record<string, unknown> }> = [];
  const postCalls: Array<{ path: string; body?: unknown }> = [];
  const putCalls: Array<{
    path: string;
    query?: Record<string, unknown>;
    body?: unknown;
  }> = [];

  let invoiceAttempts = 0;

  const result = await strategy.run(
    createTripletexStub({
      async get(path, options) {
        getCalls.push({
          path,
          query: options?.query as Record<string, unknown> | undefined,
        });

        if (path === "/customer") {
          return {
            values: [
              {
                id: 410,
                name: "Waldstein GmbH",
                organizationNumber: "975687821",
              },
            ],
          };
        }

        if (
          path ===
          "/product?productNumber=4366&productNumber=3402&fields=*"
        ) {
          return {
            values: [
              { id: 501, productNumber: "4366", name: "Netzwerkdienst" },
              { id: 502, productNumber: "3402", name: "Beratungsstunden" },
            ],
          };
        }

        if (path === "/ledger/account") {
          return {
            values: [
              {
                id: 901,
                number: "1920",
                isBankAccount: true,
                isInvoiceAccount: true,
              },
            ],
          };
        }

        if (path === "/invoice/paymentType") {
          return {
            values: [
              {
                id: 801,
                name: "Betalt til bank",
                debitAccount: {
                  id: 901,
                  number: "1920",
                  isBankAccount: true,
                  isInvoiceAccount: true,
                },
              },
            ],
          };
        }

        throw new Error(`Unexpected GET ${path}`);
      },
      async post(path, options) {
        postCalls.push({
          path,
          body: options?.body,
        });

        if (path === "/order") {
          return {
            value: {
              id: 701,
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

        if (path === "/order/701/:invoice") {
          invoiceAttempts += 1;
          if (invoiceAttempts === 1) {
            throw new TripletexHttpError({
              status: 422,
              path,
              message:
                "Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.",
            });
          }

          return {
            value: {
              id: 702,
              invoiceNumber: 30014,
              amountCurrencyOutstanding: 50200,
            },
          };
        }

        if (path === "/ledger/account/901") {
          return {
            value: {
              id: 901,
              bankAccountNumber: "12345678903",
            },
          };
        }

        if (path === "/invoice/702/:payment") {
          return {
            value: {
              id: 702,
              invoiceNumber: 30014,
              amountCurrencyOutstanding: 0,
            },
          };
        }

        throw new Error(`Unexpected PUT ${path}`);
      },
    }),
    {
      customerOrganizationNumber: "975687821",
      customerName: "Waldstein GmbH",
      invoiceDate: "2026-03-20",
      lines: [
        {
          description: "Netzwerkdienst",
          quantity: 1,
          productNumber: "4366",
          unitPriceExcludingVatNok: 32750,
        },
        {
          description: "Beratungsstunden",
          quantity: 1,
          productNumber: "3402",
          unitPriceExcludingVatNok: 17450,
        },
      ],
    },
  );

  assert.deepEqual(getCalls, [
    {
      path: "/customer",
      query: {
        organizationNumber: "975687821",
        count: 10,
        fields: "*",
      },
    },
    {
      path: "/product?productNumber=4366&productNumber=3402&fields=*",
      query: undefined,
    },
    {
      path: "/ledger/account",
      query: {
        isBankAccount: true,
        fields: "*",
      },
    },
    {
      path: "/invoice/paymentType",
      query: {
        count: 1000,
        fields: "*,debitAccount(*),creditAccount(*)",
      },
    },
  ]);
  assert.deepEqual(postCalls, [
    {
      path: "/order",
      body: {
        customer: { id: 410 },
        orderDate: "2026-03-20",
        deliveryDate: "2026-03-20",
        orderLines: [
          {
            product: { id: 501 },
            description: "Netzwerkdienst",
            count: 1,
            unitPriceExcludingVatCurrency: 32750,
          },
          {
            product: { id: 502 },
            description: "Beratungsstunden",
            count: 1,
            unitPriceExcludingVatCurrency: 17450,
          },
        ],
      },
    },
  ]);
  assert.deepEqual(putCalls, [
    {
      path: "/order/701/:invoice",
      query: {
        invoiceDate: "2026-03-20",
        sendToCustomer: false,
      },
      body: undefined,
    },
    {
      path: "/ledger/account/901",
      query: undefined,
      body: {
        bankAccountNumber: "12345678903",
      },
    },
    {
      path: "/order/701/:invoice",
      query: {
        invoiceDate: "2026-03-20",
        sendToCustomer: false,
      },
      body: undefined,
    },
    {
      path: "/invoice/702/:payment",
      query: {
        paymentDate: "2026-03-20",
        paymentTypeId: 801,
        paidAmount: 50200,
      },
      body: undefined,
    },
  ]);
  assert.deepEqual(result.createdEntityIds, {
    customerId: 410,
    orderId: 701,
    invoiceId: 702,
  });
  assert.equal(result.verification?.invoiceNumber, 30014);
  assert.equal(result.verification?.paymentTypeId, 801);
  assert.equal(result.verification?.paidAmount, 50200);
  assert.equal(result.verification?.remainingOutstanding, 0);
  assert.equal(result.verification?.usedBankAccountRepair, true);
  assert.match(
    result.notes?.[0] ?? "",
    /missing company bank account number/i,
  );
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
