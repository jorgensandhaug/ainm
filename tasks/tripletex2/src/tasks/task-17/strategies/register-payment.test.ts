import assert from "node:assert/strict";
import test from "node:test";

import type {
  TripletexClient,
  TripletexRequestOptions,
} from "../../../runtime/contracts";
import { strategy } from "./register-payment";

test("task 17 strategy pays the live outstanding amount and matches substring invoice evidence", async () => {
  const getCalls: Array<{ path: string; query?: Record<string, unknown> }> = [];
  const putCalls: Array<{ path: string; query?: Record<string, unknown> }> = [];

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
                id: 2147541030,
                invoiceNumber: 30021,
                customer: {
                  id: 500,
                  name: "Nordlys Systems AS",
                  organizationNumber: "830362894",
                },
                amountExcludingVatCurrency: 32200,
                amountCurrencyOutstanding: 40250,
                orderLines: [
                  {
                    description: "Consulting package: System Development for March",
                  },
                ],
              },
            ],
          };
        }

        if (path === "/invoice/paymentType") {
          return {
            values: [
              {
                id: 17,
                name: "Manual adjustment",
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
                id: 32813748,
                name: null,
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

        throw new Error(`Unexpected GET ${path}`);
      },
      async put(path, options) {
        putCalls.push({
          path,
          query: options?.query as Record<string, unknown> | undefined,
        });

        if (path === "/invoice/2147541030/:payment") {
          return {
            value: {
              id: 2147541030,
              invoiceNumber: 30021,
              amountCurrencyOutstanding: 0,
            },
          };
        }

        throw new Error(`Unexpected PUT ${path}`);
      },
    }),
    {
      customerOrganizationNumber: "830 362 894",
      lineDescription: "System Development",
      amountExcludingVatNok: 32200,
      paymentDate: "2026-03-20",
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
        fields: "*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))",
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
  assert.deepEqual(putCalls, [
    {
      path: "/invoice/2147541030/:payment",
      query: {
        paymentDate: "2026-03-20",
        paymentTypeId: 32813748,
        paidAmount: 40250,
      },
    },
  ]);
  assert.equal((result as { status?: string }).status, "completed");
  assert.equal(result.verification?.paidAmount, 40250);
  assert.equal(result.verification?.remainingOutstanding, 0);
});

test("task 17 strategy uses direct invoice lookup and top-level invoice evidence when invoiceId is provided", async () => {
  const getCalls: Array<{ path: string; query?: Record<string, unknown> }> = [];
  const putCalls: Array<{ path: string; query?: Record<string, unknown> }> = [];

  const result = await strategy.run(
    createTripletexStub({
      async get(path, options) {
        getCalls.push({
          path,
          query: options?.query as Record<string, unknown> | undefined,
        });

        if (path === "/invoice/2147551675") {
          return {
            value: {
              id: 2147551675,
              invoiceNumber: 30077,
              invoiceComment: "Servicio anual: Almacenamiento en la nube premium",
              customer: {
                id: 501,
                name: "Servicios Atlas SL",
                organizationNumber: "866440034",
              },
              amountExcludingVatCurrency: 30000,
              amountCurrencyOutstanding: 37500,
            },
          };
        }

        if (path === "/invoice/paymentType") {
          return {
            values: [
              {
                id: 32813748,
                name: null,
                debitAccount: {
                  number: "1920",
                  isBankAccount: true,
                  isInvoiceAccount: true,
                },
                creditAccount: null,
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
        });

        if (path === "/invoice/2147551675/:payment") {
          return {
            value: {
              id: 2147551675,
              invoiceNumber: 30077,
              amountCurrencyOutstanding: 0,
            },
          };
        }

        throw new Error(`Unexpected PUT ${path}`);
      },
    }),
    {
      customerOrganizationNumber: "866440034",
      lineDescription: "Almacenamiento en la nube",
      amountExcludingVatNok: 30000,
      invoiceId: 2147551675,
      paymentDate: "2026-03-20",
    },
  );

  assert.deepEqual(getCalls, [
    {
      path: "/invoice/2147551675",
      query: {
        fields:
          "*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))",
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
  assert.deepEqual(putCalls, [
    {
      path: "/invoice/2147551675/:payment",
      query: {
        paymentDate: "2026-03-20",
        paymentTypeId: 32813748,
        paidAmount: 37500,
      },
    },
  ]);
  assert.equal((result as { status?: string }).status, "completed");
  assert.equal(result.verification?.invoiceId, 2147551675);
  assert.equal(result.verification?.paidAmount, 37500);
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
