import assert from "node:assert/strict";
import test from "node:test";

import type {
  TripletexClient,
  TripletexRequestOptions,
} from "../../../runtime/contracts";
import { strategy } from "./cost-analysis-projects";

test("task 28 strategy paginates ledger postings, ranks the correct accounts, and batch-creates the matching projects and activities", async () => {
  const getCalls: Array<{ path: string; query?: Record<string, unknown> }> = [];
  const postCalls: Array<{ path: string; body: unknown }> = [];

  const result = await strategy.run(
    createTripletexStub({
      async get(path, options) {
        getCalls.push({
          path,
          query: options?.query as Record<string, unknown> | undefined,
        });

        if (path === "/ledger/posting") {
          const from = options?.query?.from;
          if (from === 0) {
            return {
              values: [
                {
                  amount: 50,
                  date: "2026-01-04",
                  account: {
                    id: 103,
                    type: "OPERATING_EXPENSES",
                    number: 6500,
                    name: "Software",
                    displayName: "6500 Software",
                  },
                },
                {
                  amount: 250,
                  date: "2026-02-11",
                  account: {
                    id: 103,
                    type: "OPERATING_EXPENSES",
                    number: 6500,
                    name: "Software",
                    displayName: "6500 Software",
                  },
                },
                {
                  amount: 10,
                  date: "2026-01-03",
                  account: {
                    id: 102,
                    number: 4005,
                    name: "Office Supplies",
                  },
                },
              ],
              fullResultSize: 9,
            };
          }

          if (from === 3) {
            return {
              values: [
                {
                  amount: 210,
                  date: "2026-02-09",
                  account: {
                    id: 102,
                    number: 4005,
                    name: "Office Supplies",
                  },
                },
                {
                  amount: 0,
                  date: "2026-01-05",
                  account: {
                    id: 104,
                    type: "OPERATING_EXPENSES",
                    number: 6800,
                    name: "Marketing",
                    displayName: "6800 Marketing",
                  },
                },
                {
                  amount: 150,
                  date: "2026-02-06",
                  account: {
                    id: 104,
                    type: "OPERATING_EXPENSES",
                    number: 6800,
                    name: "Marketing",
                    displayName: "6800 Marketing",
                  },
                },
              ],
              fullResultSize: 9,
            };
          }

          if (from === 6) {
            return {
              values: [
                {
                  amount: 20,
                  date: "2026-01-01",
                  account: {
                    id: 101,
                    type: "OPERATING_EXPENSES",
                    number: 6100,
                    name: "Travel",
                    displayName: "6100 Travel",
                  },
                },
                {
                  amount: 120,
                  date: "2026-02-01",
                  account: {
                    id: 101,
                    type: "OPERATING_EXPENSES",
                    number: 6100,
                    name: "Travel",
                    displayName: "6100 Travel",
                  },
                },
                {
                  amount: 999,
                  date: "2026-02-02",
                  account: {
                    id: 999,
                    type: "OPERATING_REVENUES",
                    number: 3000,
                    name: "Revenue",
                    displayName: "3000 Revenue",
                  },
                },
              ],
              fullResultSize: 9,
            };
          }
        }

        if (path === "/employee") {
          return {
            values: [{ id: 9001 }],
          };
        }

        throw new Error(`Unexpected GET ${path}`);
      },
      async post(path, options) {
        postCalls.push({ path, body: options?.body });

        if (path === "/project/list") {
          return [
            {
              id: 5001,
              name: "6500 Software",
              isInternal: true,
              projectManager: { id: 9001 },
            },
            {
              id: 5002,
              name: "4005 Office Supplies",
              isInternal: true,
              projectManager: { id: 9001 },
            },
            {
              id: 5003,
              name: "6800 Marketing",
              isInternal: true,
              projectManager: { id: 9001 },
            },
          ];
        }

        if (path === "/project/projectActivity") {
          const body = options?.body as {
            project: { id: number };
            activity: { name: string };
          };
          return {
            value: {
              id: body.project.id + 100,
              project: { id: body.project.id },
              activity: {
                id: body.project.id + 200,
                name: body.activity.name,
              },
            },
          };
        }

        throw new Error(`Unexpected POST ${path}`);
      },
    }),
    {},
  );

  assert.deepEqual(getCalls, [
    {
      path: "/ledger/posting",
      query: {
        dateFrom: "2026-01-01",
        dateTo: "2026-03-01",
        count: 10000,
        from: 0,
        fields: "*,account(*)",
      },
    },
    {
      path: "/ledger/posting",
      query: {
        dateFrom: "2026-01-01",
        dateTo: "2026-03-01",
        count: 10000,
        from: 3,
        fields: "*,account(*)",
      },
    },
    {
      path: "/ledger/posting",
      query: {
        dateFrom: "2026-01-01",
        dateTo: "2026-03-01",
        count: 10000,
        from: 6,
        fields: "*,account(*)",
      },
    },
    {
      path: "/employee",
      query: {
        assignableProjectManagers: true,
        count: 1,
        fields: "*",
      },
    },
  ]);
  assert.deepEqual(postCalls, [
    {
      path: "/project/list",
      body: [
        {
          name: "6500 Software",
          startDate: "2026-03-21",
          isInternal: true,
          projectManager: { id: 9001 },
        },
        {
          name: "4005 Office Supplies",
          startDate: "2026-03-21",
          isInternal: true,
          projectManager: { id: 9001 },
        },
        {
          name: "6800 Marketing",
          startDate: "2026-03-21",
          isInternal: true,
          projectManager: { id: 9001 },
        },
      ],
    },
    {
      path: "/project/projectActivity",
      body: {
        project: { id: 5001 },
        startDate: "2026-03-21",
        activity: {
          name: "6500 Software",
          activityType: "PROJECT_SPECIFIC_ACTIVITY",
          isChargeable: false,
        },
      },
    },
    {
      path: "/project/projectActivity",
      body: {
        project: { id: 5002 },
        startDate: "2026-03-21",
        activity: {
          name: "4005 Office Supplies",
          activityType: "PROJECT_SPECIFIC_ACTIVITY",
          isChargeable: false,
        },
      },
    },
    {
      path: "/project/projectActivity",
      body: {
        project: { id: 5003 },
        startDate: "2026-03-21",
        activity: {
          name: "6800 Marketing",
          activityType: "PROJECT_SPECIFIC_ACTIVITY",
          isChargeable: false,
        },
      },
    },
  ]);
  assert.deepEqual(result.createdEntityIds, {
    projectManagerId: 9001,
    project1Id: 5001,
    project2Id: 5002,
    project3Id: 5003,
    projectActivity1Id: 5101,
    activity1Id: 5201,
    projectActivity2Id: 5102,
    activity2Id: 5202,
    projectActivity3Id: 5103,
    activity3Id: 5203,
  });
  assert.deepEqual(result.verification?.selectedAccounts, [
    {
      id: 103,
      name: "6500 Software",
      number: 6500,
      january: 50,
      february: 250,
      increase: 200,
    },
    {
      id: 102,
      name: "4005 Office Supplies",
      number: 4005,
      january: 10,
      february: 210,
      increase: 200,
    },
    {
      id: 104,
      name: "6800 Marketing",
      number: 6800,
      january: 0,
      february: 150,
      increase: 150,
    },
  ]);
});

test("task 28 strategy accepts wrapped project-list responses and raw project-activity responses", async () => {
  const postCalls: Array<{ path: string; body: unknown }> = [];

  const result = await strategy.run(
    createTripletexStub({
      async get(path) {
        if (path === "/ledger/posting") {
          return {
            values: [
              {
                amount: 10,
                date: "2026-01-02",
                account: {
                  id: 201,
                  type: "OPERATING_EXPENSES",
                  number: 6010,
                  name: "Servers",
                  displayName: "6010 Servers",
                },
              },
              {
                amount: 110,
                date: "2026-02-02",
                account: {
                  id: 201,
                  type: "OPERATING_EXPENSES",
                  number: 6010,
                  name: "Servers",
                  displayName: "6010 Servers",
                },
              },
              {
                amount: 20,
                voucherDate: "2026-01-03",
                account: {
                  id: 202,
                  number: 6300,
                  name: "Rent",
                },
              },
              {
                amount: 90,
                voucherDate: "2026-02-03",
                account: {
                  id: 202,
                  number: 6300,
                  name: "Rent",
                },
              },
              {
                amount: 30,
                transactionDate: "2026-01-04",
                account: {
                  id: 203,
                  type: "OPERATING_EXPENSES",
                  number: 6540,
                  name: "Licences",
                  displayName: "6540 Licences",
                },
              },
              {
                amount: 80,
                transactionDate: "2026-02-04",
                account: {
                  id: 203,
                  type: "OPERATING_EXPENSES",
                  number: 6540,
                  name: "Licences",
                  displayName: "6540 Licences",
                },
              },
            ],
          };
        }

        if (path === "/employee") {
          return {
            values: [{ id: 9100 }],
          };
        }

        throw new Error(`Unexpected GET ${path}`);
      },
      async post(path, options) {
        postCalls.push({ path, body: options?.body });

        if (path === "/project/list") {
          return {
            values: [
              { id: 6001, name: "6010 Servers" },
              { id: 6002, name: "6300 Rent" },
              { id: 6003, name: "6540 Licences" },
            ],
          };
        }

        if (path === "/project/projectActivity") {
          const body = options?.body as {
            project: { id: number };
            activity: { name: string };
          };
          return {
            id: body.project.id + 1,
            project: { id: body.project.id },
            activity: {
              id: body.project.id + 2,
              name: body.activity.name,
            },
          };
        }

        throw new Error(`Unexpected POST ${path}`);
      },
    }),
    {},
  );

  assert.equal(postCalls[0]?.path, "/project/list");
  assert.deepEqual(result.createdEntityIds, {
    projectManagerId: 9100,
    project1Id: 6001,
    project2Id: 6002,
    project3Id: 6003,
    projectActivity1Id: 6002,
    activity1Id: 6003,
    projectActivity2Id: 6003,
    activity2Id: 6004,
    projectActivity3Id: 6004,
    activity3Id: 6005,
  });
});

function createTripletexStub(input: {
  get(
    path: string,
    options?: TripletexRequestOptions,
  ): Promise<unknown>;
  post(
    path: string,
    options?: TripletexRequestOptions,
  ): Promise<unknown>;
}): { clock: { today(): string }; tripletex: TripletexClient } {
  return {
    clock: {
      today() {
        return "2026-03-21";
      },
    },
    tripletex: {
      async get<TResponse>(path: string, options?: TripletexRequestOptions) {
        return (await input.get(path, options)) as TResponse;
      },
      async post<TResponse>(path: string, options?: TripletexRequestOptions) {
        return (await input.post(path, options)) as TResponse;
      },
      async put() {
        throw new Error("Unexpected PUT");
      },
    },
  };
}
