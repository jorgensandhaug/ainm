import assert from "node:assert/strict";
import test from "node:test";

import type {
  TripletexClient,
  TripletexRequestOptions,
} from "../../../runtime/contracts";
import { strategy } from "./issue-full-credit-note";

test("issue-full-credit-note strategy deduplicates matching invoice rows and accepts object creditedInvoice references", async () => {
  const getCalls: Array<{ path: string; query?: Record<string, unknown> }> = [];
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
                id: 321,
                invoiceNumber: 12004,
                customer: {
                  name: "Forêt SARL",
                  organizationNumber: "962176127",
                },
                amountExcludingVatCurrency: 10400,
                orderLines: [{ description: "Systementwicklung" }],
              },
              {
                id: 321,
                invoiceNumber: 12004,
                customer: {
                  name: "Forêt SARL",
                  organizationNumber: "962176127",
                },
                amountExcludingVatCurrency: 10400,
                orderLines: [{ description: "Systementwicklung" }],
              },
            ],
          };
        }

        throw new Error(`Unexpected GET ${path}`);
      },
      async put(path, options) {
        putCalls.push({
          path,
          query: options?.query as Record<string, unknown> | undefined,
          body: options?.body,
        });

        return {
          value: {
            id: 9001,
            invoiceNumber: 13007,
            invoiceDate: "2026-03-20",
            isCreditNote: true,
            creditedInvoice: { id: 321 },
            amountExcludingVatCurrency: -10400,
          },
        };
      },
    }),
    {
      customerOrganizationNumber: "962176127",
      lineDescription: "Systementwicklung",
      amountExcludingVatNok: 10400,
      creditNoteDate: "2026-03-20",
      customerName: "Forêt SARL",
    },
  );

  assert.deepEqual(getCalls, [
    {
      path: "/invoice",
      query: {
        invoiceDateFrom: "2000-01-01",
        invoiceDateTo: "2026-03-21",
        count: 1000,
        sorting: "-invoiceDate",
        fields: "*,customer(*),orderLines(*),orders(*,orderLines(*))",
      },
    },
  ]);
  assert.deepEqual(putCalls, [
    {
      path: "/invoice/321/:createCreditNote",
      query: {
        date: "2026-03-20",
        sendToCustomer: false,
      },
      body: undefined,
    },
  ]);
  assert.deepEqual(result.createdEntityIds, {
    originalInvoiceId: 321,
    creditNoteId: 9001,
  });
  assert.equal(result.verification?.originalInvoiceNumber, 12004);
  assert.equal(result.verification?.creditNoteNumber, 13007);
  assert.equal(result.verification?.creditNoteDate, "2026-03-20");
});

test("issue-full-credit-note strategy rejects a credit note that does not fully reverse the original invoice amount", async () => {
  await assert.rejects(
    strategy.run(
      createTripletexStub({
        async get(path) {
          if (path === "/invoice") {
            return {
              values: [
                {
                  id: 654,
                  invoiceNumber: 22009,
                  customer: {
                    name: "Forêt SARL",
                    organizationNumber: "962176127",
                  },
                  amountExcludingVatCurrency: 10400,
                  orderLines: [{ description: "Systementwicklung" }],
                },
              ],
            };
          }

          throw new Error(`Unexpected GET ${path}`);
        },
        async put() {
          return {
            value: {
              id: 9100,
              invoiceNumber: 23010,
              isCreditNote: true,
              creditedInvoice: 654,
              amountExcludingVatCurrency: -10399,
            },
          };
        },
      }),
      {
        customerOrganizationNumber: "962176127",
        lineDescription: "Systementwicklung",
        amountExcludingVatNok: 10400,
        creditNoteDate: "2026-03-20",
      },
    ),
    /did not fully reverse original invoice amount 10400/,
  );
});

function createTripletexStub(handlers: {
  get(path: string, options?: TripletexRequestOptions): Promise<unknown>;
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
      async post() {
        throw new Error("Unexpected POST");
      },
      async put<TResponse>(path: string, options?: TripletexRequestOptions) {
        return (await handlers.put(path, options)) as TResponse;
      },
    },
  };
}
