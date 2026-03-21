import assert from "node:assert/strict";
import test from "node:test";

import type {
  TripletexClient,
  TripletexRequestOptions,
} from "../../../runtime/contracts";
import { TripletexHttpError } from "../../../runtime/tripletex-client";
import { strategy } from "./set-fixed-price-milestone";

test("task 14 strategy skips customer, employee, and project writes when the project search already proves the target state", async () => {
  const getCalls: Array<{ path: string; query?: Record<string, unknown> }> = [];
  const postCalls: Array<{ path: string; body: unknown }> = [];
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

        if (path === "/project") {
          return {
            values: [
              {
                id: 701,
                name: "Automatiseringsprosjekt",
                startDate: "2026-02-01",
                isClosed: false,
                isFixedPrice: true,
                fixedprice: 430750,
                customer: {
                  id: 410,
                  name: "Fossekraft AS",
                  organizationNumber: "907433498",
                },
                projectManager: {
                  id: 510,
                  email: "solveig.eide@example.org",
                  firstName: "Solveig",
                  lastName: "Eide",
                },
              },
            ],
          };
        }

        if (path === "/ledger/vatType") {
          return {
            values: [{ id: 901, percentage: 25 }],
          };
        }

        throw new Error(`Unexpected GET ${path}`);
      },
      async post(path, options) {
        postCalls.push({ path, body: options?.body });

        if (path === "/order") {
          return { value: { id: 801 } };
        }

        throw new Error(`Unexpected POST ${path}`);
      },
      async put(path, options) {
        putCalls.push({
          path,
          query: options?.query as Record<string, unknown> | undefined,
          body: options?.body,
        });

        if (path === "/order/801/:invoice") {
          return {
            value: {
              id: 901,
              invoiceNumber: 30014,
              customer: { id: 410 },
              orders: [{ id: 801 }],
              amountExcludingVatCurrency: 215375,
              amountCurrencyOutstanding: 269218.75,
            },
          };
        }

        throw new Error(`Unexpected PUT ${path}`);
      },
    }),
    {
      projectName: "Automatiseringsprosjekt",
      customerOrganizationNumber: "907433498",
      customerName: "Fossekraft AS",
      projectManagerEmail: "solveig.eide@example.org",
      fixedPriceExcludingVatNok: 430750,
      milestoneAmountExcludingVatNok: 215375,
      milestonePercentage: 50,
      invoiceDate: "2026-03-20",
    },
  );

  assert.deepEqual(getCalls, [
    {
      path: "/project",
      query: {
        name: "Automatiseringsprosjekt",
        count: 50,
        fields: "*,customer(*),projectManager(*)",
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
      path: "/order",
      body: {
        customer: { id: 410 },
        project: { id: 701 },
        orderDate: "2026-03-20",
        deliveryDate: "2026-03-20",
        invoiceOnAccountVatHigh: false,
        orderLines: [
          {
            description: "Milestone invoice 50% of fixed price",
            count: 1,
            unitPriceExcludingVatCurrency: 215375,
            vatType: { id: 901 },
          },
        ],
      },
    },
  ]);
  assert.deepEqual(putCalls, [
    {
      path: "/order/801/:invoice",
      query: {
        invoiceDate: "2026-03-20",
        sendToCustomer: false,
      },
      body: undefined,
    },
  ]);
  assert.deepEqual(result.createdEntityIds, {
    customerId: 410,
    projectManagerId: 510,
    projectId: 701,
    orderId: 801,
    invoiceId: 901,
  });
  assert.equal(result.verification?.projectWriteSkipped, true);
  assert.equal(result.verification?.invoiceNumber, 30014);
});

test("task 14 strategy reuses the existing project startDate and updates the project before invoicing when the manager or fixed price differ", async () => {
  const getCalls: Array<{ path: string; query?: Record<string, unknown> }> = [];
  const postCalls: Array<{ path: string; body: unknown }> = [];
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

        if (path === "/project") {
          return {
            values: [
              {
                id: 702,
                name: "Desarrollo e-commerce",
                startDate: "2026-01-15",
                isClosed: false,
                isFixedPrice: true,
                fixedprice: 300000,
                customer: {
                  id: 420,
                  name: "Estrella SL",
                  organizationNumber: "816896770",
                },
                projectManager: {
                  id: 521,
                  email: "old.pm@example.org",
                  firstName: "Old",
                  lastName: "Manager",
                },
              },
            ],
          };
        }

        if (path === "/employee") {
          return {
            values: [
              {
                id: 530,
                email: "adriana.garcia@example.org",
                firstName: "Adriana",
                lastName: "Garcia",
              },
            ],
          };
        }

        if (path === "/ledger/vatType") {
          return {
            values: [{ id: 6, percentage: 0 }],
          };
        }

        throw new Error(`Unexpected GET ${path}`);
      },
      async post(path, options) {
        postCalls.push({ path, body: options?.body });

        if (path === "/order") {
          return { value: { id: 802 } };
        }

        throw new Error(`Unexpected POST ${path}`);
      },
      async put(path, options) {
        putCalls.push({
          path,
          query: options?.query as Record<string, unknown> | undefined,
          body: options?.body,
        });

        if (path === "/project/702") {
          return {
            value: {
              id: 702,
              name: "Desarrollo e-commerce",
              startDate: "2026-01-15",
              isFixedPrice: true,
              fixedprice: 375250,
              customer: { id: 420 },
              projectManager: { id: 530 },
            },
          };
        }

        if (path === "/order/802/:invoice") {
          return {
            value: {
              id: 902,
              invoiceNumber: 30015,
              customer: { id: 420 },
              orders: [{ id: 802 }],
              amountExcludingVatCurrency: 123832.5,
              amountCurrencyOutstanding: 123832.5,
            },
          };
        }

        throw new Error(`Unexpected PUT ${path}`);
      },
    }),
    {
      projectName: "Desarrollo e-commerce",
      customerOrganizationNumber: "816896770",
      customerName: "Estrella SL",
      projectManagerEmail: "adriana.garcia@example.org",
      projectManagerName: "Adriana Garcia",
      fixedPriceExcludingVatNok: 375250,
      milestoneAmountExcludingVatNok: 123832.5,
      milestonePercentage: 33,
      milestoneDescription: "33% milestone",
      invoiceDate: "2026-03-20",
    },
  );

  assert.deepEqual(getCalls, [
    {
      path: "/project",
      query: {
        name: "Desarrollo e-commerce",
        count: 50,
        fields: "*,customer(*),projectManager(*)",
      },
    },
    {
      path: "/employee",
      query: {
        email: "adriana.garcia@example.org",
        assignableProjectManagers: true,
        count: 10,
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
      path: "/order",
      body: {
        customer: { id: 420 },
        project: { id: 702 },
        orderDate: "2026-03-20",
        deliveryDate: "2026-03-20",
        invoiceOnAccountVatHigh: false,
        orderLines: [
          {
            description: "33% milestone",
            count: 1,
            unitPriceExcludingVatCurrency: 123832.5,
            vatType: { id: 6 },
          },
        ],
      },
    },
  ]);
  assert.deepEqual(putCalls, [
    {
      path: "/project/702",
      query: undefined,
      body: {
        name: "Desarrollo e-commerce",
        startDate: "2026-01-15",
        customer: { id: 420 },
        projectManager: { id: 530 },
        isFixedPrice: true,
        fixedprice: 375250,
        invoiceOnAccountVatHigh: false,
      },
    },
    {
      path: "/order/802/:invoice",
      query: {
        invoiceDate: "2026-03-20",
        sendToCustomer: false,
      },
      body: undefined,
    },
  ]);
  assert.equal(result.verification?.projectWriteSkipped, false);
  assert.equal(result.verification?.amountExcludingVatCurrency, 123832.5);
});

test("task 14 strategy creates the missing customer and repairs the bank-account prerequisite after the first invoice failure", async () => {
  const getCalls: Array<{ path: string; query?: Record<string, unknown> }> = [];
  const postCalls: Array<{ path: string; body: unknown }> = [];
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

        if (path === "/project") {
          return { values: [] };
        }

        if (path === "/customer") {
          return { values: [] };
        }

        if (path === "/employee") {
          return {
            values: [
              {
                id: 540,
                email: "knut.kvamme@example.org",
                firstName: "Knut",
                lastName: "Kvamme",
              },
            ],
          };
        }

        if (path === "/ledger/vatType") {
          return {
            values: [{ id: 6, percentage: 0 }],
          };
        }

        if (path === "/ledger/account") {
          return {
            values: [
              {
                id: 1920,
                number: 1920,
                isInvoiceAccount: true,
                bankAccountNumber: null,
              },
            ],
          };
        }

        throw new Error(`Unexpected GET ${path}`);
      },
      async post(path, options) {
        postCalls.push({ path, body: options?.body });

        if (path === "/customer") {
          return {
            value: {
              id: 430,
              name: "Sjøbris AS",
              organizationNumber: "825338756",
            },
          };
        }

        if (path === "/project") {
          return {
            value: {
              id: 730,
              name: "Automatiseringsprosjekt",
              startDate: "2026-03-21",
              customer: { id: 430 },
              projectManager: { id: 540 },
              isFixedPrice: true,
              fixedprice: 316000,
            },
          };
        }

        if (path === "/order") {
          return { value: { id: 803 } };
        }

        throw new Error(`Unexpected POST ${path}`);
      },
      async put(path, options) {
        putCalls.push({
          path,
          query: options?.query as Record<string, unknown> | undefined,
          body: options?.body,
        });

        if (path === "/order/803/:invoice") {
          invoiceAttemptCount += 1;
          if (invoiceAttemptCount === 1) {
            throw new TripletexHttpError({
              status: 422,
              path,
              message:
                "Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.",
            });
          }

          return {
            value: {
              id: 903,
              invoiceNumber: 30016,
              customer: { id: 430 },
              orders: [{ id: 803 }],
              amountExcludingVatCurrency: 158000,
              amountCurrencyOutstanding: 158000,
            },
          };
        }

        if (path === "/ledger/account/1920") {
          return { value: { id: 1920 } };
        }

        throw new Error(`Unexpected PUT ${path}`);
      },
    }),
    {
      projectName: "Automatiseringsprosjekt",
      customerOrganizationNumber: "825338756",
      customerName: "Sjøbris AS",
      projectManagerEmail: "knut.kvamme@example.org",
      projectManagerName: "Knut Kvamme",
      fixedPriceExcludingVatNok: 316000,
      milestoneAmountExcludingVatNok: 158000,
      milestonePercentage: 50,
    },
  );

  assert.deepEqual(getCalls, [
    {
      path: "/project",
      query: {
        name: "Automatiseringsprosjekt",
        count: 50,
        fields: "*,customer(*),projectManager(*)",
      },
    },
    {
      path: "/customer",
      query: {
        organizationNumber: "825338756",
        count: 10,
        fields: "*",
      },
    },
    {
      path: "/employee",
      query: {
        email: "knut.kvamme@example.org",
        assignableProjectManagers: true,
        count: 10,
        fields: "*",
      },
    },
    {
      path: "/ledger/vatType",
      query: {
        typeOfVat: "OUTGOING",
        vatDate: "2026-03-21",
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
  assert.deepEqual(postCalls, [
    {
      path: "/customer",
      body: {
        name: "Sjøbris AS",
        organizationNumber: "825338756",
        invoiceSendMethod: "MANUAL",
      },
    },
    {
      path: "/project",
      body: {
        name: "Automatiseringsprosjekt",
        startDate: "2026-03-21",
        customer: { id: 430 },
        projectManager: { id: 540 },
        isFixedPrice: true,
        fixedprice: 316000,
        invoiceOnAccountVatHigh: false,
      },
    },
    {
      path: "/order",
      body: {
        customer: { id: 430 },
        project: { id: 730 },
        orderDate: "2026-03-21",
        deliveryDate: "2026-03-21",
        invoiceOnAccountVatHigh: false,
        orderLines: [
          {
            description: "Milestone invoice 50% of fixed price",
            count: 1,
            unitPriceExcludingVatCurrency: 158000,
            vatType: { id: 6 },
          },
        ],
      },
    },
  ]);
  assert.equal(putCalls.length, 3);
  assert.deepEqual(putCalls[0], {
    path: "/order/803/:invoice",
    query: {
      invoiceDate: "2026-03-21",
      sendToCustomer: false,
    },
    body: undefined,
  });
  assert.equal(putCalls[1]?.path, "/ledger/account/1920");
  assert.match(
    String((putCalls[1]?.body as { bankAccountNumber?: unknown }).bankAccountNumber),
    /^[0-9]{11}$/,
  );
  assert.deepEqual(putCalls[2], {
    path: "/order/803/:invoice",
    query: {
      invoiceDate: "2026-03-21",
      sendToCustomer: false,
    },
    body: undefined,
  });
  assert.equal(result.verification?.customerCreated, true);
  assert.match(result.notes?.join("\n") ?? "", /created it with invoiceSendMethod=MANUAL/);
  assert.match(result.notes?.join("\n") ?? "", /repaired the invoice bank account/);
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
