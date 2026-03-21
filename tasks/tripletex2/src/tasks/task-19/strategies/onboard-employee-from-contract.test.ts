import assert from "node:assert/strict";
import test from "node:test";

import type {
  TripletexClient,
  TripletexRequestOptions,
} from "../../../runtime/contracts";
import { strategy } from "./onboard-employee-from-contract";

test("task 19 strategy reuses the newest exact department and writes the deterministic 2511 occupation mapping without division", async () => {
  const calls: string[] = [];
  const getCalls: Array<{ path: string; query?: Record<string, unknown> }> = [];
  const postCalls: Array<{ path: string; body: unknown }> = [];

  const result = await strategy.run(
    createTripletexStub({
      async get(path, options) {
        calls.push(`GET ${path}`);
        getCalls.push({
          path,
          query: options?.query as Record<string, unknown> | undefined,
        });

        if (path === "/division") {
          return {
            values: [],
          };
        }

        if (path === "/department") {
          return {
            values: [
              { id: 932220, name: "Kundeservice" },
              { id: 932226, name: "Kundeservice" },
              { id: 932227, name: "Kundeservice Arkiv" },
            ],
          };
        }

        throw new Error(`Unexpected GET ${path}`);
      },
      async post(path, options) {
        calls.push(`POST ${path}`);
        postCalls.push({ path, body: options?.body });

        if (path === "/employee") {
          return {
            value: {
              id: 18626378,
              email: "henrik.degard@example.org",
              dateOfBirth: "1987-01-24",
              employments: [{ id: 2816699 }],
            },
          };
        }

        throw new Error(`Unexpected POST ${path}`);
      },
    }),
    {
      employeeName: "Henrik Ødegård",
      birthDate: "24.01.1987",
      email: "Henrik.Degard@Example.org",
      nationalIdentityNumber: "240187 93071",
      bankAccountNumber: "5296 78 43393",
      departmentName: "Kundeservice",
      occupationCodeId: 301,
      annualSalaryNok: 820000,
      percentageOfFullTimeEquivalent: 100,
      startDate: "09.09.2026",
    },
  );

  assert.deepEqual(calls, [
    "GET /division",
    "GET /department",
    "POST /employee",
  ]);
  assert.deepEqual(getCalls, [
    {
      path: "/division",
      query: {
        count: 1,
        fields: "id",
      },
    },
    {
      path: "/department",
      query: {
        name: "Kundeservice",
        isInactive: false,
        count: 1000,
        fields: "*",
      },
    },
  ]);
  assert.deepEqual(postCalls, [
    {
      path: "/employee",
      body: {
        firstName: "Henrik",
        lastName: "Ødegård",
        dateOfBirth: "1987-01-24",
        email: "henrik.degard@example.org",
        nationalIdentityNumber: "24018793071",
        bankAccountNumber: "52967843393",
        userType: "NO_ACCESS",
        department: { id: 932226 },
        employments: [
          {
            startDate: "2026-09-09",
            employmentDetails: [
              {
                date: "2026-09-09",
                employmentType: "ORDINARY",
                employmentForm: "PERMANENT",
                remunerationType: "MONTHLY_WAGE",
                workingHoursScheme: "NOT_SHIFT",
                percentageOfFullTimeEquivalent: 100,
                annualSalary: 820000,
                occupationCode: { id: 301 },
              },
            ],
          },
        ],
      },
    },
  ]);
  assert.deepEqual(result.createdEntityIds, {
    employeeId: 18626378,
    departmentId: 932226,
    employmentId: 2816699,
  });
  assert.equal(result.verification?.divisionIncluded, false);
  assert.equal(result.verification?.occupationCodeId, 301);
  assert.equal(result.verification?.startDate, "2026-09-09");
});

test("task 19 strategy creates the department and standard time when the contract requires both", async () => {
  const calls: string[] = [];
  const postCalls: Array<{ path: string; body: unknown }> = [];

  const result = await strategy.run(
    createTripletexStub({
      async get(path) {
        calls.push(`GET ${path}`);

        if (path === "/division") {
          return {
            values: [{ id: 108244566 }],
          };
        }

        if (path === "/department") {
          return {
            values: [],
          };
        }

        throw new Error(`Unexpected GET ${path}`);
      },
      async post(path, options) {
        calls.push(`POST ${path}`);
        postCalls.push({ path, body: options?.body });

        if (path === "/department") {
          return {
            value: {
              id: 9901,
              name: "Salg",
            },
          };
        }

        if (path === "/employee") {
          return {
            value: {
              id: 18880001,
              email: "knut.haugen@example.org",
              dateOfBirth: "1982-01-01",
              employments: [{ id: 2817001 }],
            },
          };
        }

        if (path === "/employee/standardTime") {
          return {
            value: {
              id: 771,
              hoursPerDay: 7.5,
            },
          };
        }

        throw new Error(`Unexpected POST ${path}`);
      },
    }),
    {
      employeeName: "Knut Haugen",
      birthDate: "1982-01-01",
      departmentName: "Salg",
      occupationCodeId: 4930,
      annualSalaryNok: 690000,
      percentageOfFullTimeEquivalent: 1,
      startDate: "2026-05-23",
      standardHoursPerDay: 7.5,
    },
  );

  assert.deepEqual(calls, [
    "GET /division",
    "GET /department",
    "POST /department",
    "POST /employee",
    "POST /employee/standardTime",
  ]);
  assert.deepEqual(postCalls, [
    {
      path: "/department",
      body: {
        name: "Salg",
      },
    },
    {
      path: "/employee",
      body: {
        firstName: "Knut",
        lastName: "Haugen",
        dateOfBirth: "1982-01-01",
        userType: "NO_ACCESS",
        department: { id: 9901 },
        employments: [
          {
            startDate: "2026-05-23",
            division: { id: 108244566 },
            employmentDetails: [
              {
                date: "2026-05-23",
                employmentType: "ORDINARY",
                employmentForm: "PERMANENT",
                remunerationType: "MONTHLY_WAGE",
                workingHoursScheme: "NOT_SHIFT",
                percentageOfFullTimeEquivalent: 100,
                annualSalary: 690000,
                occupationCode: { id: 4930 },
              },
            ],
          },
        ],
      },
    },
    {
      path: "/employee/standardTime",
      body: {
        employee: { id: 18880001 },
        fromDate: "2026-05-23",
        hoursPerDay: 7.5,
      },
    },
  ]);
  assert.deepEqual(result.createdEntityIds, {
    employeeId: 18880001,
    departmentId: 9901,
    employmentId: 2817001,
    standardTimeId: 771,
  });
  assert.equal(result.verification?.divisionIncluded, true);
  assert.equal(result.verification?.standardHoursPerDay, 7.5);
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
