import assert from "node:assert/strict";
import test from "node:test";

import type {
  TripletexClient,
  TripletexRequestOptions,
} from "../../../runtime/contracts";
import { strategy } from "./create-customer-invoice";

test("create-customer-invoice strategy reuses resolved product VAT ids on the exact product-number branch", async () => {
  const getCalls: Array<{ path: string; query?: Record<string, unknown> }> = [];
  const postCalls: Array<{
    path: string;
    query?: Record<string, unknown>;
    body: unknown;
  }> = [];

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
              { id: 410, name: "Sierra SL", organizationNumber: "861379760" },
            ],
          };
        }

        if (
          path ===
          "/product?productNumber=2109&productNumber=1175&productNumber=9974&fields=*"
        ) {
          return {
            values: [
              {
                id: 501,
                number: "2109",
                name: "Mantenimiento",
                vatType: { id: 901, percentage: 25 },
              },
              {
                id: 502,
                number: "1175",
                name: "Horas de consultor\u00eda",
                vatType: { id: 902, percentage: 15 },
              },
              {
                id: 503,
                number: "9974",
                name: "Informe de an\u00e1lisis",
                vatType: { id: 903, percentage: 0 },
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

        return {
          value: {
            id: 801,
            invoiceNumber: 30014,
            amountExcludingVatCurrency: 34800,
            amountCurrency: 42260,
            amountOutstanding: 42260,
          },
        };
      },
    }),
    {
      customerOrganizationNumber: "861379760",
      invoiceDate: "2026-03-20",
      invoiceDueDate: "2026-04-03",
      customerName: "Sierra SL",
      lines: [
        {
          description: "Mantenimiento",
          productNumber: "2109",
          quantity: 1,
          unitPriceExcludingVatNok: 27500,
          vatRatePercent: 25,
        },
        {
          description: "Horas de consultor\u00eda",
          productNumber: "1175",
          quantity: 1,
          unitPriceExcludingVatNok: 3900,
          vatRatePercent: 15,
        },
        {
          description: "Informe de an\u00e1lisis",
          productNumber: "9974",
          quantity: 1,
          unitPriceExcludingVatNok: 3400,
          vatRatePercent: 0,
        },
      ],
    },
  );

  assert.deepEqual(getCalls, [
    {
      path: "/customer",
      query: {
        organizationNumber: "861379760",
        count: 10,
        fields: "*",
      },
    },
    {
      path: "/product?productNumber=2109&productNumber=1175&productNumber=9974&fields=*",
      query: undefined,
    },
  ]);
  assert.deepEqual(postCalls, [
    {
      path: "/invoice",
      query: {
        sendToCustomer: false,
      },
      body: {
        invoiceDate: "2026-03-20",
        invoiceDueDate: "2026-04-03",
        customer: { id: 410 },
        orders: [
          {
            customer: { id: 410 },
            orderDate: "2026-03-20",
            deliveryDate: "2026-03-20",
            orderLines: [
              {
                product: { id: 501 },
                description: "Mantenimiento",
                count: 1,
                unitPriceExcludingVatCurrency: 27500,
                vatType: { id: 901 },
              },
              {
                product: { id: 502 },
                description: "Horas de consultor\u00eda",
                count: 1,
                unitPriceExcludingVatCurrency: 3900,
                vatType: { id: 902 },
              },
              {
                product: { id: 503 },
                description: "Informe de an\u00e1lisis",
                count: 1,
                unitPriceExcludingVatCurrency: 3400,
                vatType: { id: 903 },
              },
            ],
          },
        ],
      },
    },
  ]);
  assert.deepEqual(result.createdEntityIds, {
    customerId: 410,
    invoiceId: 801,
  });
  assert.equal(result.verification?.sendToCustomerRequested, false);
  assert.equal(result.verification?.invoiceNumber, 30014);
});

test("create-customer-invoice strategy falls back to outgoing VAT lookup when resolved products lack reusable VAT ids", async () => {
  const getCalls: Array<{ path: string; query?: Record<string, unknown> }> = [];
  const postCalls: Array<{
    path: string;
    query?: Record<string, unknown>;
    body: unknown;
  }> = [];

  await strategy.run(
    createTripletexStub({
      async get(path, options) {
        getCalls.push({
          path,
          query: options?.query as Record<string, unknown> | undefined,
        });

        if (path === "/customer") {
          return {
            values: [
              { id: 410, name: "Sierra SL", organizationNumber: "861379760" },
            ],
          };
        }

        if (path === "/product") {
          return {
            values: [
              { id: 501, name: "Mantenimiento" },
              { id: 502, name: "Horas de consultor\u00eda" },
              { id: 503, name: "Informe de an\u00e1lisis" },
            ],
          };
        }

        if (path === "/ledger/vatType") {
          return {
            values: [
              { id: 901, percentage: 25 },
              { id: 902, percentage: 15 },
              { id: 903, percentage: 0 },
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

        return {
          value: {
            id: 802,
            invoiceNumber: 30015,
            amountExcludingVatCurrency: 34800,
            amountCurrency: 42260,
            amountOutstanding: 42260,
          },
        };
      },
    }),
    {
      customerOrganizationNumber: "861379760",
      invoiceDate: "2026-03-20",
      invoiceDueDate: "2026-04-03",
      customerName: "Sierra SL",
      lines: [
        {
          description: "Mantenimiento",
          productName: "Mantenimiento",
          quantity: 1,
          unitPriceExcludingVatNok: 27500,
          vatRatePercent: 25,
        },
        {
          description: "Horas de consultor\u00eda",
          productName: "Horas de consultor\u00eda",
          quantity: 1,
          unitPriceExcludingVatNok: 3900,
          vatRatePercent: 15,
        },
        {
          description: "Informe de an\u00e1lisis",
          productName: "Informe de an\u00e1lisis",
          quantity: 1,
          unitPriceExcludingVatNok: 3400,
          vatRatePercent: 0,
        },
      ],
    },
  );

  assert.deepEqual(getCalls, [
    {
      path: "/customer",
      query: {
        organizationNumber: "861379760",
        count: 10,
        fields: "*",
      },
    },
    {
      path: "/product",
      query: {
        count: 1000,
        fields: "*",
      },
    },
    {
      path: "/ledger/vatType",
      query: {
        typeOfVat: "OUTGOING",
        vatDate: "2026-03-20",
        fields: "*",
      },
    },
  ]);
  assert.deepEqual(postCalls, [
    {
      path: "/invoice",
      query: {
        sendToCustomer: false,
      },
      body: {
        invoiceDate: "2026-03-20",
        invoiceDueDate: "2026-04-03",
        customer: { id: 410 },
        orders: [
          {
            customer: { id: 410 },
            orderDate: "2026-03-20",
            deliveryDate: "2026-03-20",
            orderLines: [
              {
                product: { id: 501 },
                description: "Mantenimiento",
                count: 1,
                unitPriceExcludingVatCurrency: 27500,
                vatType: { id: 901 },
              },
              {
                product: { id: 502 },
                description: "Horas de consultor\u00eda",
                count: 1,
                unitPriceExcludingVatCurrency: 3900,
                vatType: { id: 902 },
              },
              {
                product: { id: 503 },
                description: "Informe de an\u00e1lisis",
                count: 1,
                unitPriceExcludingVatCurrency: 3400,
                vatType: { id: 903 },
              },
            ],
          },
        ],
      },
    },
  ]);
});

function createTripletexStub(handlers: {
  get(path: string, options?: TripletexRequestOptions): Promise<unknown>;
  post(path: string, options?: TripletexRequestOptions): Promise<unknown>;
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
      async put() {
        throw new Error("Unexpected PUT");
      },
    },
  };
}
