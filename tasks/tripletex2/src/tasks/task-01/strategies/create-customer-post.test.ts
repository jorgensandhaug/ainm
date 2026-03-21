import assert from "node:assert/strict";
import test from "node:test";

import type {
  TripletexClient,
  TripletexRequestOptions,
} from "../../../runtime/contracts";
import { strategy } from "./create-customer-post";

test("create-customer strategy posts the exact one-call customer payload", async () => {
  let capturedPath = "";
  let capturedBody: unknown;

  const result = await strategy.run(
    createTripletexStub(async (path, options) => {
      capturedPath = path;
      capturedBody = options?.body;
      return {
        value: {
          id: 108268199,
          name: "Northwave Ltd",
          organizationNumber: "964179239",
          email: "post@northwave.no",
          postalAddress: {
            addressLine1: "Nygata 39",
            postalCode: "2317",
            city: "Hamar",
          },
        },
      };
    }),
    {
      customerName: "Northwave Ltd",
      organizationNumber: "964 179 239",
      email: "post@northwave.no",
      postalAddress: {
        addressLine1: "Nygata 39",
        postalCode: "2317",
        city: "Hamar",
      },
    },
  );

  assert.equal(capturedPath, "/customer");
  assert.deepEqual(capturedBody, {
    name: "Northwave Ltd",
    organizationNumber: "964179239",
    email: "post@northwave.no",
    postalAddress: {
      addressLine1: "Nygata 39",
      postalCode: "2317",
      city: "Hamar",
    },
  });
  assert.deepEqual(result.createdEntityIds, {
    customerId: 108268199,
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
