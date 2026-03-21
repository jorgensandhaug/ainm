import assert from "node:assert/strict";
import test from "node:test";

import type {
  TripletexClient,
  TripletexRequestOptions,
} from "../../../runtime/contracts";
import { strategy } from "./correct-ledger-errors";

test("task 24 strategy posts one corrective voucher for the four known ledger anomalies", async () => {
  const calls: string[] = [];
  let capturedVoucherBody: Record<string, unknown> | undefined;

  const result = await strategy.run(
    createTripletexStub({
      async get(path, options) {
        calls.push(`GET ${path}`);

        if (path === "/ledger/account") {
          assert.deepEqual(options?.query, {
            number: "7300,7000,6860,6500,2710",
            fields: "*",
          });
          return {
            values: [
              { id: 7300, number: 7300 },
              { id: 7000, number: 7000 },
              { id: 6860, number: 6860 },
              { id: 6500, number: 6500 },
              { id: 2710, number: 2710 },
            ],
          };
        }

        if (path === "/ledger/voucher") {
          assert.equal(options?.query?.dateFrom, "2026-01-01");
          assert.equal(options?.query?.dateTo, "2026-03-01");
          return {
            values: [
              {
                id: 99,
                number: 99,
                date: "2026-01-05",
                description: "Reversed candidate",
                postings: [
                  {
                    account: { id: 7300, number: 7300 },
                    amountGross: 7800,
                  },
                  {
                    account: { id: 1920, number: 1920 },
                    amountGross: -7800,
                  },
                ],
              },
              {
                id: 100,
                number: 100,
                date: "2026-01-06",
                description: "Reverse of reversed candidate",
                reverseVoucher: { id: 99 },
                postings: [
                  {
                    account: { id: 7300, number: 7300 },
                    amountGross: -7800,
                  },
                  {
                    account: { id: 1920, number: 1920 },
                    amountGross: 7800,
                  },
                ],
              },
              {
                id: 101,
                number: 101,
                date: "2026-01-12",
                description: "Wrong account expense",
                postings: [
                  {
                    account: { id: 7300, number: 7300 },
                    amountGross: 7800,
                    vatType: { id: 15 },
                    project: { id: 501 },
                    currency: { id: 1 },
                  },
                  {
                    account: { id: 1920, number: 1920 },
                    amountGross: -7800,
                    currency: { id: 1 },
                  },
                ],
              },
              {
                id: 201,
                number: 201,
                date: "2026-01-20",
                description: "Ordinary office expense",
                postings: [
                  {
                    account: { id: 6860, number: 6860 },
                    amountGross: 3500,
                    currency: { id: 1 },
                  },
                  {
                    account: { id: 1920, number: 1920 },
                    amountGross: -3500,
                    currency: { id: 1 },
                  },
                ],
              },
              {
                id: 202,
                number: 202,
                date: "2026-01-21",
                description: "Duplikat office expense",
                postings: [
                  {
                    account: { id: 6860, number: 6860 },
                    amountGross: 3500,
                    currency: { id: 1 },
                  },
                  {
                    account: { id: 1920, number: 1920 },
                    amountGross: -3500,
                    currency: { id: 1 },
                  },
                ],
              },
              {
                id: 301,
                number: 301,
                date: "2026-02-10",
                description: "Missing VAT",
                postings: [
                  {
                    account: { id: 6500, number: 6500 },
                    amountGross: 18350,
                    currency: { id: 1 },
                  },
                  {
                    account: { id: 2400, number: 2400 },
                    amountGross: -18350,
                    supplier: { id: 66 },
                    currency: { id: 1 },
                  },
                ],
              },
              {
                id: 401,
                number: 401,
                date: "2026-02-18",
                description: "Wrong amount expense",
                postings: [
                  {
                    account: { id: 7300, number: 7300 },
                    amountGross: 15000,
                    vatType: { id: 15 },
                    currency: { id: 1 },
                  },
                  {
                    account: { id: 1920, number: 1920 },
                    amountGross: -15000,
                    currency: { id: 1 },
                  },
                ],
              },
            ],
          };
        }

        throw new Error(`Unexpected GET ${path}`);
      },
      async post(path, options) {
        calls.push(`POST ${path}`);

        if (path === "/ledger/voucher") {
          assert.deepEqual(options?.query, { sendToLedger: true });
          capturedVoucherBody = options?.body as Record<string, unknown>;
          return {
            value: {
              id: 777,
              number: 555,
            },
          };
        }

        throw new Error(`Unexpected POST ${path}`);
      },
    }),
    {},
  );

  assert.deepEqual(calls, [
    "GET /ledger/account",
    "GET /ledger/voucher",
    "POST /ledger/voucher",
  ]);
  assert.equal(capturedVoucherBody?.date, "2026-02-28");
  assert.equal(
    capturedVoucherBody?.description,
    "Korreksjonsbilag januar-februar 2026",
  );

  const postings = (capturedVoucherBody?.postings ?? []) as Array<
    Record<string, unknown>
  >;
  assert.equal(postings.length, 8);
  assert.deepEqual(
    postings.map((posting) => ({
      row: posting.row,
      accountId: (posting.account as { id: number }).id,
      amountGross: posting.amountGross,
      vatTypeId: (posting.vatType as { id: number } | undefined)?.id ?? null,
      supplierId: (posting.supplier as { id: number } | undefined)?.id ?? null,
      projectId: (posting.project as { id: number } | undefined)?.id ?? null,
    })),
    [
      {
        row: 1,
        accountId: 7300,
        amountGross: -7800,
        vatTypeId: 15,
        supplierId: null,
        projectId: 501,
      },
      {
        row: 2,
        accountId: 7000,
        amountGross: 7800,
        vatTypeId: 15,
        supplierId: null,
        projectId: 501,
      },
      {
        row: 3,
        accountId: 6860,
        amountGross: -3500,
        vatTypeId: null,
        supplierId: null,
        projectId: null,
      },
      {
        row: 4,
        accountId: 1920,
        amountGross: 3500,
        vatTypeId: null,
        supplierId: null,
        projectId: null,
      },
      {
        row: 5,
        accountId: 6500,
        amountGross: 4587.5,
        vatTypeId: 1,
        supplierId: null,
        projectId: null,
      },
      {
        row: 6,
        accountId: 2400,
        amountGross: -4587.5,
        vatTypeId: null,
        supplierId: 66,
        projectId: null,
      },
      {
        row: 7,
        accountId: 7300,
        amountGross: -4950,
        vatTypeId: 15,
        supplierId: null,
        projectId: null,
      },
      {
        row: 8,
        accountId: 1920,
        amountGross: 4950,
        vatTypeId: null,
        supplierId: null,
        projectId: null,
      },
    ],
  );

  assert.deepEqual(result.createdEntityIds, {
    voucherId: 777,
  });
  assert.deepEqual(result.verification, {
    correctionDate: "2026-02-28",
    correctionVoucherNumber: 555,
    wrongAccountVoucherId: 101,
    duplicateVoucherId: 202,
    missingVatVoucherId: 301,
    wrongAmountVoucherId: 401,
    correctionPostingCount: 8,
    missingVatCorrectionAmount: 4587.5,
    wrongAmountCorrectionAmount: 4950,
  });
});

function createTripletexStub(handlers: {
  get?: (
    path: string,
    options?: TripletexRequestOptions,
  ) => Promise<unknown>;
  post?: (
    path: string,
    options?: TripletexRequestOptions,
  ) => Promise<unknown>;
  put?: (
    path: string,
    options?: TripletexRequestOptions,
  ) => Promise<unknown>;
}): { clock: { today(): string }; tripletex: TripletexClient } {
  return {
    clock: {
      today() {
        return "2026-03-21";
      },
    },
    tripletex: {
      async get<TResponse>(path: string, options?: TripletexRequestOptions) {
        if (!handlers.get) {
          throw new Error(`Unexpected GET ${path}`);
        }

        return (await handlers.get(path, options)) as TResponse;
      },
      async post<TResponse>(path: string, options?: TripletexRequestOptions) {
        if (!handlers.post) {
          throw new Error(`Unexpected POST ${path}`);
        }

        return (await handlers.post(path, options)) as TResponse;
      },
      async put<TResponse>(path: string, options?: TripletexRequestOptions) {
        if (!handlers.put) {
          throw new Error(`Unexpected PUT ${path}`);
        }

        return (await handlers.put(path, options)) as TResponse;
      },
    },
  };
}
