import assert from "node:assert/strict";
import test from "node:test";

import type {
  TripletexClient,
  TripletexRequestOptions,
} from "../../../runtime/contracts";
import { strategy } from "./create-supplier-post";

test("create-supplier strategy mirrors invoice-looking email into invoiceEmail", async () => {
  let capturedPath = "";
  let capturedBody: unknown;

  const result = await strategy.run(
    createTripletexStub(async (path, options) => {
      capturedPath = path;
      capturedBody = options?.body;
      return {
        value: {
          id: 108281110,
          name: "Northwave Ltd",
          organizationNumber: "949044378",
          email: "faktura@northwaveltd.no",
          invoiceEmail: "faktura@northwaveltd.no",
        },
      };
    }),
    {
      supplierName: "Northwave Ltd",
      organizationNumber: "949 044 378",
      email: "faktura@northwaveltd.no",
    },
  );

  assert.equal(capturedPath, "/supplier");
  assert.deepEqual(capturedBody, {
    name: "Northwave Ltd",
    organizationNumber: "949044378",
    email: "faktura@northwaveltd.no",
    invoiceEmail: "faktura@northwaveltd.no",
  });
  assert.deepEqual(result.createdEntityIds, {
    supplierId: 108281110,
  });
});

test("create-supplier strategy preserves an explicit invoiceEmail distinct from email", async () => {
  let capturedBody: unknown;

  await strategy.run(
    createTripletexStub(async (_path, options) => {
      capturedBody = options?.body;
      return {
        value: {
          id: 108281238,
          name: "Cascade SARL",
          organizationNumber: "997712560",
          email: "contact@cascade.no",
          invoiceEmail: "invoice@cascade.no",
        },
      };
    }),
    {
      supplierName: "Cascade SARL",
      organizationNumber: "997712560",
      email: "contact@cascade.no",
      invoiceEmail: "invoice@cascade.no",
    },
  );

  assert.deepEqual(capturedBody, {
    name: "Cascade SARL",
    organizationNumber: "997712560",
    email: "contact@cascade.no",
    invoiceEmail: "invoice@cascade.no",
  });
});

function createTripletexStub(
  postImpl: (
    path: string,
    options?: TripletexRequestOptions,
  ) => Promise<unknown>,
): { clock: { today(): string }; tripletex: TripletexClient } {
  return {
    clock: {
      today() {
        return "2026-03-21";
      },
    },
    tripletex: {
      async get() {
        throw new Error("Unexpected GET");
      },
      async post<TResponse>(path: string, options?: TripletexRequestOptions) {
        return (await postImpl(path, options)) as TResponse;
      },
      async put() {
        throw new Error("Unexpected PUT");
      },
    },
  };
}
