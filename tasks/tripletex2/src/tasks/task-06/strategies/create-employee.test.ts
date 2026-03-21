import assert from "node:assert/strict";
import test from "node:test";

import type {
  TripletexClient,
  TripletexRequestOptions,
} from "../../../runtime/contracts";
import { TripletexHttpError } from "../../../runtime/tripletex-client";
import { strategy } from "./create-employee";

test("create-employee strategy follows the department and division repair ladder before verifying employment startDate", async () => {
  const postCalls: Array<{ path: string; body: unknown }> = [];
  const getCalls: Array<{ path: string; query?: Record<string, unknown> }> = [];

  const result = await strategy.run(
    createTripletexStub({
      async get(path, options) {
        getCalls.push({
          path,
          query: options?.query as Record<string, unknown> | undefined,
        });

        if (path === "/department") {
          return {
            values: [{ id: 701, name: "Operations" }],
          };
        }

        if (path === "/division") {
          return {
            values: [{ id: 801, name: "Main division" }],
          };
        }

        if (path === "/employee/employment") {
          return {
            values: [{ id: 901, startDate: "2026-10-06" }],
          };
        }

        throw new Error(`Unexpected GET ${path}`);
      },
      async post(path, options) {
        postCalls.push({ path, body: options?.body });

        if (postCalls.length < 3) {
          throw new TripletexHttpError({
            status: 422,
            path,
            message: "Validering feilet.",
          });
        }

        return {
          value: {
            id: 601,
            email: "thomas.harris@example.org",
            dateOfBirth: "1991-06-04",
            userType: null,
            employments: [{ id: 901 }],
          },
        };
      },
    }),
    {
      employeeName: "Thomas Harris",
      birthDate: "1991-06-04",
      email: "thomas.harris@example.org",
      startDate: "2026-10-06",
    },
  );

  assert.deepEqual(postCalls, [
    {
      path: "/employee",
      body: {
        firstName: "Thomas",
        lastName: "Harris",
        dateOfBirth: "1991-06-04",
        email: "thomas.harris@example.org",
        userType: "NO_ACCESS",
        employments: [{ startDate: "2026-10-06" }],
      },
    },
    {
      path: "/employee",
      body: {
        firstName: "Thomas",
        lastName: "Harris",
        dateOfBirth: "1991-06-04",
        email: "thomas.harris@example.org",
        userType: "NO_ACCESS",
        department: { id: 701 },
        employments: [{ startDate: "2026-10-06" }],
      },
    },
    {
      path: "/employee",
      body: {
        firstName: "Thomas",
        lastName: "Harris",
        dateOfBirth: "1991-06-04",
        email: "thomas.harris@example.org",
        userType: "NO_ACCESS",
        department: { id: 701 },
        employments: [{ startDate: "2026-10-06", division: { id: 801 } }],
      },
    },
  ]);
  assert.deepEqual(getCalls, [
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
      path: "/employee/employment",
      query: {
        employeeId: 601,
        fields: "*",
      },
    },
  ]);
  assert.deepEqual(result.createdEntityIds, {
    employeeId: 601,
    employmentId: 901,
  });
  assert.equal(result.verification?.userTypeRequested, "NO_ACCESS");
  assert.equal(result.verification?.startDate, "2026-10-06");
});

test("create-employee strategy normalizes name, dates, and email before posting", async () => {
  const postCalls: Array<{ path: string; body: unknown }> = [];

  const result = await strategy.run(
    createTripletexStub({
      async get(path) {
        throw new Error(`Unexpected GET ${path}`);
      },
      async post(path, options) {
        postCalls.push({ path, body: options?.body });

        return {
          value: {
            id: 602,
            email: "joao.rodrigues@example.org",
            dateOfBirth: "1980-09-05",
            userType: "NO_ACCESS",
            employments: [{ id: 902, startDate: "2026-08-08" }],
          },
        };
      },
    }),
    {
      employeeName: "  João   Rodrigues  ",
      birthDate: "5 September 1980",
      email: "  JOAO.RODRIGUES@EXAMPLE.ORG  ",
      startDate: "08.08.2026",
    },
  );

  assert.deepEqual(postCalls, [
    {
      path: "/employee",
      body: {
        firstName: "João",
        lastName: "Rodrigues",
        dateOfBirth: "1980-09-05",
        email: "joao.rodrigues@example.org",
        userType: "NO_ACCESS",
        employments: [{ startDate: "2026-08-08" }],
      },
    },
  ]);
  assert.deepEqual(result.createdEntityIds, {
    employeeId: 602,
    employmentId: 902,
  });
  assert.equal(result.verification?.employeeName, "João Rodrigues");
  assert.equal(result.verification?.dateOfBirth, "1980-09-05");
  assert.equal(result.verification?.email, "joao.rodrigues@example.org");
  assert.equal(result.verification?.startDate, "2026-08-08");
});

test("create-employee strategy does not mask explicit input-field validation errors with repair lookups", async () => {
  const getCalls: Array<{ path: string; query?: Record<string, unknown> }> = [];
  const postCalls: Array<{ path: string; body: unknown }> = [];

  await assert.rejects(
    strategy.run(
      createTripletexStub({
        async get(path, options) {
          getCalls.push({
            path,
            query: options?.query as Record<string, unknown> | undefined,
          });
          throw new Error(`Unexpected GET ${path}`);
        },
        async post(path, options) {
          postCalls.push({ path, body: options?.body });
          throw new TripletexHttpError({
            status: 422,
            path,
            message: "dateOfBirth must be a valid calendar date.",
          });
        },
      }),
      {
        employeeName: "Thomas Harris",
        birthDate: "1991-06-04",
        email: "thomas.harris@example.org",
        startDate: "2026-10-06",
      },
    ),
    /birthDate must be a valid calendar date|dateOfBirth must be a valid calendar date/,
  );

  assert.equal(postCalls.length, 1);
  assert.deepEqual(getCalls, []);
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
