import assert from "node:assert/strict";
import test from "node:test";

import type {
  TripletexClient,
  TripletexRequestOptions,
} from "../../../runtime/contracts";
import { TripletexHttpError } from "../../../runtime/tripletex-client";
import { strategy } from "./full-project-lifecycle";

test("task 29 strategy creates the missing lifecycle entities, splits oversized hours, and resumes invoice creation after the bank-account repair branch", async () => {
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

        if (path === "/customer") {
          return { values: [] };
        }

        if (path === "/supplier") {
          return { values: [] };
        }

        if (
          path === "/employee" &&
          options?.query?.email === "lukas.hoffmann@example.org" &&
          options?.query?.assignableProjectManagers === true
        ) {
          return { values: [] };
        }

        if (
          path === "/employee" &&
          options?.query?.assignableProjectManagers === true &&
          options?.query?.email === undefined
        ) {
          return {
            values: [
              {
                id: 910,
                email: "fallback.manager@example.org",
                firstName: "Fallback",
                lastName: "Manager",
              },
            ],
          };
        }

        if (
          path === "/employee" &&
          options?.query?.email === "lukas.hoffmann@example.org" &&
          options?.query?.assignableProjectManagers !== true
        ) {
          return { values: [] };
        }

        if (
          path === "/employee" &&
          options?.query?.email === "tobias.meyer@example.org" &&
          options?.query?.assignableProjectManagers !== true
        ) {
          return {
            values: [
              {
                id: 302,
                email: "tobias.meyer@example.org",
                firstName: "Tobias",
                lastName: "Meyer",
              },
            ],
          };
        }

        if (path === "/department") {
          return {
            values: [{ id: 401, name: "Avdeling" }],
          };
        }

        if (path === "/division") {
          return {
            values: [{ id: 402, name: "Oslo" }],
          };
        }

        if (path === "/ledger/vatType") {
          return {
            values: [{ id: 801, percentage: 25 }],
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
              id: 101,
              name: "Brückentor GmbH",
              organizationNumber: "882854000",
            },
          };
        }

        if (path === "/supplier") {
          return {
            value: {
              id: 201,
              name: "Sonnental GmbH",
              organizationNumber: "930613118",
            },
          };
        }

        if (path === "/employee") {
          return {
            value: {
              id: 301,
              email: "lukas.hoffmann@example.org",
              firstName: "Lukas",
              lastName: "Hoffmann",
            },
          };
        }

        if (path === "/project") {
          return {
            value: {
              id: 501,
              name: "Cloud-Migration Brückentor",
              startDate: "2026-03-21",
              customer: { id: 101 },
              projectManager: { id: 910 },
            },
          };
        }

        if (path === "/project/projectActivity") {
          return {
            value: {
              id: 601,
              budgetFeeCurrency: 262850,
              project: { id: 501 },
              activity: {
                id: 602,
                name: "Prosjektarbeid",
                isChargeable: false,
              },
            },
          };
        }

        if (path === "/timesheet/entry/list") {
          return {
            values: [
              { id: 701, employee: { id: 301 }, project: { id: 501 }, activity: { id: 602 }, date: "2026-03-21", hours: 24 },
              { id: 702, employee: { id: 301 }, project: { id: 501 }, activity: { id: 602 }, date: "2026-03-22", hours: 13 },
              { id: 703, employee: { id: 302 }, project: { id: 501 }, activity: { id: 602 }, date: "2026-03-21", hours: 24 },
              { id: 704, employee: { id: 302 }, project: { id: 501 }, activity: { id: 602 }, date: "2026-03-22", hours: 24 },
              { id: 705, employee: { id: 302 }, project: { id: 501 }, activity: { id: 602 }, date: "2026-03-23", hours: 24 },
              { id: 706, employee: { id: 302 }, project: { id: 501 }, activity: { id: 602 }, date: "2026-03-24", hours: 24 },
              { id: 707, employee: { id: 302 }, project: { id: 501 }, activity: { id: 602 }, date: "2026-03-25", hours: 5 },
            ],
          };
        }

        if (path === "/project/orderline") {
          return {
            value: {
              id: 801,
              project: { id: 501 },
              vendor: { id: 201 },
              description: "Leverandørkostnad",
              unitCostCurrency: 89750,
            },
          };
        }

        if (path === "/order") {
          return { value: { id: 901 } };
        }

        throw new Error(`Unexpected POST ${path}`);
      },
      async put(path, options) {
        putCalls.push({
          path,
          query: options?.query as Record<string, unknown> | undefined,
          body: options?.body,
        });

        if (path === "/order/901/:invoice") {
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
              id: 1001,
              invoiceNumber: 444001,
              customer: { id: 101 },
              orders: [{ id: 901 }],
              amountExcludingVatCurrency: 262850,
              amountCurrencyOutstanding: 328562.5,
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
      projectName: "Cloud-Migration Brückentor",
      customerName: "Brückentor GmbH",
      customerOrganizationNumber: "882854000",
      projectBudgetNok: 262850,
      employees: [
        {
          employeeName: "Lukas Hoffmann",
          email: "lukas.hoffmann@example.org",
          hours: 37,
        },
        {
          employeeName: "Tobias Meyer",
          email: "tobias.meyer@example.org",
          hours: 101,
        },
      ],
      supplierName: "Sonnental GmbH",
      supplierOrganizationNumber: "930613118",
      supplierCostNok: 89750,
    },
  );

  assert.deepEqual(getCalls, [
    {
      path: "/customer",
      query: {
        organizationNumber: "882854000",
        count: 10,
        fields: "*",
      },
    },
    {
      path: "/supplier",
      query: {
        organizationNumber: "930613118",
        count: 10,
        fields: "*",
      },
    },
    {
      path: "/employee",
      query: {
        email: "lukas.hoffmann@example.org",
        assignableProjectManagers: true,
        count: 10,
        fields: "*",
      },
    },
    {
      path: "/employee",
      query: {
        assignableProjectManagers: true,
        count: 50,
        fields: "*",
      },
    },
    {
      path: "/employee",
      query: {
        email: "lukas.hoffmann@example.org",
        count: 10,
        fields: "*",
      },
    },
    {
      path: "/department",
      query: {
        isInactive: false,
        count: 1,
        fields: "*",
      },
    },
    {
      path: "/division",
      query: {
        count: 1,
        fields: "*",
      },
    },
    {
      path: "/employee",
      query: {
        email: "tobias.meyer@example.org",
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

  assert.equal(postCalls.length, 8);
  assert.deepEqual(postCalls[0], {
    path: "/customer",
    body: {
      name: "Brückentor GmbH",
      organizationNumber: "882854000",
    },
  });
  assert.deepEqual(postCalls[1], {
    path: "/supplier",
    body: {
      name: "Sonnental GmbH",
      organizationNumber: "930613118",
    },
  });
  assert.deepEqual(postCalls[2], {
    path: "/employee",
    body: {
      firstName: "Lukas",
      lastName: "Hoffmann",
      email: "lukas.hoffmann@example.org",
      dateOfBirth: "1985-01-15",
      userType: "NO_ACCESS",
      department: { id: 401 },
      employments: [{ startDate: "2026-03-21", division: { id: 402 } }],
    },
  });
  assert.deepEqual(postCalls[3], {
    path: "/project",
    body: {
      name: "Cloud-Migration Brückentor",
      startDate: "2026-03-21",
      customer: { id: 101 },
      projectManager: { id: 910 },
    },
  });
  assert.deepEqual(postCalls[4], {
    path: "/project/projectActivity",
    body: {
      project: { id: 501 },
      startDate: "2026-03-21",
      budgetFeeCurrency: 262850,
      activity: {
        name: "Prosjektarbeid",
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    },
  });
  assert.deepEqual(postCalls[5], {
    path: "/timesheet/entry/list",
    body: [
      { employee: { id: 301 }, project: { id: 501 }, activity: { id: 602 }, date: "2026-03-21", hours: 24 },
      { employee: { id: 301 }, project: { id: 501 }, activity: { id: 602 }, date: "2026-03-22", hours: 13 },
      { employee: { id: 302 }, project: { id: 501 }, activity: { id: 602 }, date: "2026-03-21", hours: 24 },
      { employee: { id: 302 }, project: { id: 501 }, activity: { id: 602 }, date: "2026-03-22", hours: 24 },
      { employee: { id: 302 }, project: { id: 501 }, activity: { id: 602 }, date: "2026-03-23", hours: 24 },
      { employee: { id: 302 }, project: { id: 501 }, activity: { id: 602 }, date: "2026-03-24", hours: 24 },
      { employee: { id: 302 }, project: { id: 501 }, activity: { id: 602 }, date: "2026-03-25", hours: 5 },
    ],
  });
  assert.deepEqual(postCalls[6], {
    path: "/project/orderline",
    body: {
      project: { id: 501 },
      vendor: { id: 201 },
      description: "Leverandørkostnad",
      date: "2026-03-21",
      count: 1,
      unitCostCurrency: 89750,
      isChargeable: false,
    },
  });
  assert.deepEqual(postCalls[7], {
    path: "/order",
    body: {
      customer: { id: 101 },
      project: { id: 501 },
      orderDate: "2026-03-21",
      deliveryDate: "2026-03-25",
      orderLines: [
        {
          description: "Cloud-Migration Brückentor",
          count: 1,
          unitPriceExcludingVatCurrency: 262850,
          vatType: { id: 801 },
        },
      ],
    },
  });

  assert.equal(putCalls.length, 3);
  assert.deepEqual(putCalls[0], {
    path: "/order/901/:invoice",
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
    path: "/order/901/:invoice",
    query: {
      invoiceDate: "2026-03-21",
      sendToCustomer: false,
    },
    body: undefined,
  });

  assert.deepEqual(result.createdEntityIds, {
    customerId: 101,
    supplierId: 201,
    projectManagerId: 910,
    projectId: 501,
    projectActivityId: 601,
    activityId: 602,
    projectCostId: 801,
    orderId: 901,
    invoiceId: 1001,
    employee1Id: 301,
    employee2Id: 302,
  });
  assert.equal(result.verification?.customerCreated, true);
  assert.equal(result.verification?.supplierCreated, true);
  assert.equal(result.verification?.timesheetEntryCount, 7);
  assert.equal(result.verification?.projectManagerEmailUsed, "fallback.manager@example.org");
  assert.equal(result.verification?.repairedInvoiceBankAccount, true);
  assert.match(
    result.notes?.join("\n") ?? "",
    /Preferred manager lukas\.hoffmann@example\.org was not available as an assignable project manager/,
  );
  assert.match(
    result.notes?.join("\n") ?? "",
    /deterministic placeholder birth dates were used/,
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
