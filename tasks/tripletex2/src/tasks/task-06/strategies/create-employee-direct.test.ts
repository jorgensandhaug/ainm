import assert from "node:assert/strict";
import test from "node:test";

import type {
  TripletexClient,
  TripletexRequestOptions,
} from "../../../runtime/contracts";
import { TripletexHttpError } from "../../../runtime/tripletex-client";
import { strategy } from "./create-employee-direct";

test("create-employee-direct v2 uses 2 calls in the happy path (direct create + employment verify)", async () => {
  const calls: string[] = [];

  const result = await strategy.run(
    createTripletexStub({
      async get(path) {
        calls.push(`GET ${path}`);

        if (path === "/employee/employment") {
          return {
            values: [{ id: 901, startDate: "2026-10-06" }],
          };
        }

        throw new Error(`Unexpected GET ${path}`);
      },
      async post(path) {
        calls.push(`POST ${path}`);

        if (path === "/employee") {
          return {
            value: {
              id: 601,
              email: "thomas.harris@example.org",
              dateOfBirth: "1991-06-04",
              userType: null,
              employments: [{ id: 901 }],
            },
          };
        }

        throw new Error(`Unexpected POST ${path}`);
      },
    }),
    {
      employeeName: "Thomas Harris",
      birthDate: "1991-06-04",
      email: "thomas.harris@example.org",
      startDate: "2026-10-06",
    },
  );

  assert.deepEqual(calls, [
    "POST /employee",
    "GET /employee/employment",
  ]);
  assert.deepEqual(result.createdEntityIds, {
    employeeId: 601,
    employmentId: 901,
  });
  assert.equal(result.verification?.userTypeRequested, "NO_ACCESS");
  assert.equal(result.verification?.startDate, "2026-10-06");
});

test("create-employee-direct v2 skips employment verify when the create response proves startDate", async () => {
  const calls: string[] = [];

  const result = await strategy.run(
    createTripletexStub({
      async get(path) {
        calls.push(`GET ${path}`);
        throw new Error(`Unexpected GET ${path}`);
      },
      async post(path) {
        calls.push(`POST ${path}`);

        if (path === "/employee") {
          return {
            value: {
              id: 602,
              email: "joao.rodrigues@example.org",
              dateOfBirth: "1980-09-05",
              userType: "NO_ACCESS",
              employments: [{ id: 902, startDate: "2026-08-08" }],
            },
          };
        }

        throw new Error(`Unexpected POST ${path}`);
      },
    }),
    {
      employeeName: "  João   Rodrigues  ",
      birthDate: "5 September 1980",
      email: "  JOAO.RODRIGUES@EXAMPLE.ORG  ",
      startDate: "08.08.2026",
    },
  );

  assert.deepEqual(calls, ["POST /employee"]);
  assert.deepEqual(result.createdEntityIds, {
    employeeId: 602,
    employmentId: 902,
  });
  assert.equal(result.verification?.employeeName, "João Rodrigues");
  assert.equal(result.verification?.dateOfBirth, "1980-09-05");
  assert.equal(result.verification?.email, "joao.rodrigues@example.org");
  assert.equal(result.verification?.startDate, "2026-08-08");
});

test("create-employee-direct v2 resolves dept and div in parallel on generic 422, then retries once", async () => {
  const calls: string[] = [];
  let postAttempts = 0;

  const result = await strategy.run(
    createTripletexStub({
      async get(path) {
        calls.push(`GET ${path}`);

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
        calls.push(`POST ${path}`);
        postAttempts += 1;

        if (path === "/employee") {
          if (postAttempts === 1) {
            throw new TripletexHttpError({
              status: 422,
              path,
              message: "Validering feilet.",
            });
          }

          const body = options?.body as Record<string, unknown>;
          assert.deepEqual(body.department, { id: 701 });
          const employments = body.employments as Array<Record<string, unknown>>;
          assert.deepEqual(employments[0].division, { id: 801 });

          return {
            value: {
              id: 601,
              email: "thomas.harris@example.org",
              dateOfBirth: "1991-06-04",
              userType: null,
              employments: [{ id: 901 }],
            },
          };
        }

        throw new Error(`Unexpected POST ${path}`);
      },
    }),
    {
      employeeName: "Thomas Harris",
      birthDate: "1991-06-04",
      email: "thomas.harris@example.org",
      startDate: "2026-10-06",
    },
  );

  assert.deepEqual(calls, [
    "POST /employee",
    "GET /department",
    "GET /division",
    "POST /employee",
    "GET /employee/employment",
  ]);
  assert.equal(postAttempts, 2);
  assert.deepEqual(result.createdEntityIds, {
    employeeId: 601,
    employmentId: 901,
  });
  assert.equal(result.verification?.startDate, "2026-10-06");
});

test("create-employee-direct v2 does not mask explicit input-field validation errors with repair lookups", async () => {
  const getCalls: string[] = [];

  await assert.rejects(
    strategy.run(
      createTripletexStub({
        async get(path) {
          getCalls.push(path);
          throw new Error(`Unexpected GET ${path}`);
        },
        async post(path) {
          if (path === "/employee") {
            throw new TripletexHttpError({
              status: 422,
              path,
              message: "dateOfBirth must be a valid calendar date.",
            });
          }

          throw new Error(`Unexpected POST ${path}`);
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

  assert.deepEqual(getCalls, []);
});

test("create-employee-direct v2 creates department when none exists during repair", async () => {
  const calls: string[] = [];
  let postAttempts = 0;
  let departmentCreated = false;

  const result = await strategy.run(
    createTripletexStub({
      async get(path) {
        calls.push(`GET ${path}`);

        if (path === "/department") {
          return { values: [] };
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
        calls.push(`POST ${path}`);

        if (path === "/department") {
          departmentCreated = true;
          const body = options?.body as Record<string, unknown>;
          assert.equal(body.name, "Thomas Harris Department");
          return {
            value: { id: 702, name: "Thomas Harris Department" },
          };
        }

        if (path === "/employee") {
          postAttempts += 1;
          if (postAttempts === 1) {
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
        }

        throw new Error(`Unexpected POST ${path}`);
      },
    }),
    {
      employeeName: "Thomas Harris",
      birthDate: "1991-06-04",
      email: "thomas.harris@example.org",
      startDate: "2026-10-06",
    },
  );

  assert.ok(departmentCreated, "Expected department to be created");
  assert.deepEqual(result.createdEntityIds, {
    employeeId: 601,
    employmentId: 901,
  });
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
