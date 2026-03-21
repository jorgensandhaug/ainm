import assert from "node:assert/strict";
import test from "node:test";

import type {
  TripletexClient,
  TripletexRequestOptions,
} from "../../../runtime/contracts";
import { TripletexHttpError } from "../../../runtime/tripletex-client";
import { strategy } from "./register-hours-then-project-order-invoice";

test("task 15 strategy keeps the non-chargeable fast path and repairs the invoice bank account with a unique valid number", async () => {
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

        if (path === "/employee") {
          return {
            values: [{ id: 501, email: "sophia.schmidt@example.org" }],
          };
        }

        if (path === "/project") {
          return {
            values: [
              {
                id: 601,
                name: "Sicherheitsaudit",
                startDate: "2026-03-01",
                isClosed: false,
                customer: {
                  id: 701,
                  name: "Windkraft GmbH",
                  organizationNumber: "882984826",
                },
              },
            ],
          };
        }

        if (path === "/activity/>forTimeSheet") {
          return {
            values: [{ id: 801, name: "Design", isChargeable: false }],
          };
        }

        if (path === "/ledger/vatType") {
          return {
            values: [{ id: 901, percentage: 25 }],
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
              {
                id: 1921,
                number: 1930,
                isInvoiceAccount: false,
                bankAccountNumber: "32100000007",
              },
            ],
          };
        }

        throw new Error(`Unexpected GET ${path}`);
      },
      async post(path, options) {
        postCalls.push({ path, body: options?.body });

        if (path === "/timesheet/entry") {
          return {
            value: {
              id: 1001,
              hours: 18,
              projectChargeableHours: 18,
              chargeable: false,
              hourlyRate: 0,
              date: "2026-03-21",
              project: { id: 601 },
              activity: { id: 801 },
            },
          };
        }

        if (path === "/order") {
          return {
            value: { id: 1002 },
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

        if (path === "/order/1002/:invoice") {
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
              id: 1003,
              invoiceNumber: 45001,
              customer: { id: 701 },
              orders: [{ id: 1002 }],
              amountExcludingVatCurrency: 17100,
              amountCurrencyOutstanding: 21375,
            },
          };
        }

        if (path === "/ledger/account/1920") {
          return {
            value: {
              id: 1920,
            },
          };
        }

        throw new Error(`Unexpected PUT ${path}`);
      },
    }),
    {
      employeeEmail: "sophia.schmidt@example.org",
      projectName: "Sicherheitsaudit",
      customerOrganizationNumber: "882984826",
      customerName: "Windkraft GmbH",
      activityName: "Design",
      hours: 18,
      hourlyRateExcludingVatNok: 950,
    },
  );

  assert.deepEqual(getCalls, [
    {
      path: "/employee",
      query: {
        email: "sophia.schmidt@example.org",
        count: 10,
        fields: "*",
      },
    },
    {
      path: "/project",
      query: {
        name: "Sicherheitsaudit",
        count: 50,
        fields: "*,customer(*)",
      },
    },
    {
      path: "/activity/>forTimeSheet",
      query: {
        projectId: 601,
        employeeId: 501,
        date: "2026-03-21",
        query: "Design",
        filterExistingHours: false,
        count: 50,
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
      path: "/timesheet/entry",
      body: {
        employee: { id: 501 },
        project: { id: 601 },
        activity: { id: 801 },
        date: "2026-03-21",
        hours: 18,
        projectChargeableHours: 18,
      },
    },
    {
      path: "/order",
      body: {
        customer: { id: 701 },
        project: { id: 601 },
        orderDate: "2026-03-21",
        deliveryDate: "2026-03-21",
        invoiceOnAccountVatHigh: false,
        orderLines: [
          {
            description: "Design",
            count: 18,
            unitPriceExcludingVatCurrency: 950,
            vatType: { id: 901 },
          },
        ],
      },
    },
  ]);
  assert.equal(putCalls.length, 3);
  assert.deepEqual(putCalls[0], {
    path: "/order/1002/:invoice",
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
  assert.notEqual(
    (putCalls[1]?.body as { bankAccountNumber?: unknown }).bankAccountNumber,
    "32100000007",
  );
  assert.deepEqual(putCalls[2], {
    path: "/order/1002/:invoice",
    query: {
      invoiceDate: "2026-03-21",
      sendToCustomer: false,
    },
    body: undefined,
  });
  assert.deepEqual(result.createdEntityIds, {
    orderId: 1002,
    invoiceId: 1003,
    timesheetEntryId: 1001,
  });
  assert.equal(result.verification?.activityChargeable, false);
  assert.equal(result.verification?.amountExcludingVatCurrency, 17100);
  assert.match(
    result.notes?.join("\n") ?? "",
    /skipped project-hourly-rate writes/,
  );
  assert.match(
    result.notes?.join("\n") ?? "",
    /repaired the invoice bank account/,
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
