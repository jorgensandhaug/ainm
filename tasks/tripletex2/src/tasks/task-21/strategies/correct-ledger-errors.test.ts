import assert from "node:assert/strict";
import test from "node:test";

import type {
  TripletexClient,
  TripletexRequestOptions,
} from "../../../runtime/contracts";
import { strategy } from "./correct-ledger-errors";

test("task 21 strategy scans the ledger once and posts the four deterministic corrections", async () => {
  const calls: Array<{
    method: "GET" | "POST" | "PUT";
    path: string;
    query?: Record<string, unknown>;
    body?: unknown;
  }> = [];
  let createdVoucherCount = 0;

  const result = await strategy.run(
    createContext({
      async get(path, options) {
        calls.push({
          method: "GET",
          path,
          query: options?.query as Record<string, unknown> | undefined,
        });

        if (path === "/ledger/voucher") {
          assert.deepEqual(options?.query, {
            dateFrom: "2026-01-01",
            dateTo: "2026-03-01",
            count: 1000,
            sorting: "date",
            fields:
              "*,reverseVoucher(*),postings(*,account(*),supplier(*),customer(*),employee(*),project(*),product(*),department(*),vatType(*),currency(*),amortizationAccount(*),closeGroup(*),freeAccountingDimension1(*),freeAccountingDimension2(*),freeAccountingDimension3(*))",
          });

          return {
            values: [
              {
                id: 101,
                number: 1101,
                date: "2026-01-12",
                description: "Telefonkostnad feil konto",
                postings: [
                  {
                    row: 1,
                    description: "Telefonkostnad",
                    account: { id: 710001, number: 7100 },
                    amount: 2250,
                    amountCurrency: 2250,
                    amountGross: 2250,
                    amountGrossCurrency: 2250,
                  },
                  {
                    row: 2,
                    description: "Telefonkostnad",
                    account: { id: 192001, number: 1920 },
                    amount: -2250,
                    amountCurrency: -2250,
                    amountGross: -2250,
                    amountGrossCurrency: -2250,
                  },
                ],
              },
              {
                id: 201,
                number: 1201,
                date: "2026-01-20",
                description: "Kontorrekvisita",
                postings: [
                  {
                    row: 1,
                    description: "Kontorrekvisita",
                    account: { id: 650001, number: 6500 },
                    amount: 1500,
                    amountCurrency: 1500,
                    amountGross: 1500,
                    amountGrossCurrency: 1500,
                  },
                  {
                    row: 2,
                    description: "Kontorrekvisita",
                    account: { id: 240001, number: 2400 },
                    supplier: { id: 77 },
                    amount: -1500,
                    amountCurrency: -1500,
                    amountGross: -1500,
                    amountGrossCurrency: -1500,
                  },
                ],
              },
              {
                id: 202,
                number: 1202,
                date: "2026-01-20",
                description: "Kontorrekvisita",
                postings: [
                  {
                    row: 1,
                    description: "Kontorrekvisita",
                    account: { id: 650001, number: 6500 },
                    amount: 1500,
                    amountCurrency: 1500,
                    amountGross: 1500,
                    amountGrossCurrency: 1500,
                  },
                  {
                    row: 2,
                    description: "Kontorrekvisita",
                    account: { id: 240001, number: 2400 },
                    supplier: { id: 77 },
                    amount: -1500,
                    amountCurrency: -1500,
                    amountGross: -1500,
                    amountGrossCurrency: -1500,
                  },
                ],
              },
              {
                id: 301,
                number: 1301,
                date: "2026-02-03",
                description: "Programvarelisens",
                postings: [
                  {
                    row: 1,
                    description: "Programvarelisens",
                    account: { id: 654001, number: 6540 },
                    vatType: { id: 81, number: "1" },
                    amount: 22000,
                    amountCurrency: 22000,
                    amountGross: 22000,
                    amountGrossCurrency: 22000,
                  },
                  {
                    row: 2,
                    description: "Programvarelisens",
                    account: { id: 240002, number: 2400 },
                    supplier: { id: 88 },
                    currency: { id: 1, number: "NOK" },
                    invoiceNumber: "LEV-8841",
                    termOfPayment: "NETT14",
                    amount: -22000,
                    amountCurrency: -22000,
                    amountGross: -22000,
                    amountGrossCurrency: -22000,
                  },
                ],
              },
              {
                id: 401,
                number: 1401,
                date: "2026-02-17",
                description: "Kursavgift",
                postings: [
                  {
                    row: 1,
                    description: "Kursavgift",
                    account: { id: 686001, number: 6860 },
                    amount: 8650,
                    amountCurrency: 8650,
                    amountGross: 8650,
                    amountGrossCurrency: 8650,
                  },
                  {
                    row: 2,
                    description: "Kursavgift",
                    account: { id: 240003, number: 2400 },
                    supplier: { id: 99 },
                    currency: { id: 1, number: "NOK" },
                    invoiceNumber: "KURS-2026-09",
                    amount: -8650,
                    amountCurrency: -8650,
                    amountGross: -8650,
                    amountGrossCurrency: -8650,
                  },
                ],
              },
            ],
          };
        }

        if (path === "/ledger/account") {
          assert.deepEqual(options?.query, {
            number: "2710,7140",
            fields: "*",
            count: 1000,
          });

          return {
            values: [
              { id: 271001, number: 2710 },
              { id: 714001, number: 7140 },
            ],
          };
        }

        throw new Error(`Unexpected GET ${path}`);
      },
      async post(path, options) {
        calls.push({
          method: "POST",
          path,
          query: options?.query as Record<string, unknown> | undefined,
          body: options?.body,
        });

        assert.equal(path, "/ledger/voucher");
        assert.deepEqual(options?.query, { sendToLedger: true });

        createdVoucherCount += 1;
        if (createdVoucherCount === 1) {
          assert.deepEqual(options?.body, {
            date: "2026-01-12",
            description: "Korrigering: Telefonkostnad feil konto",
            voucherType: null,
            postings: [
              {
                row: 1,
                date: "2026-01-12",
                description: "Korrigering konto 7100 til 7140",
                account: { id: 714001 },
                currency: { id: 1 },
                amount: 2250,
                amountCurrency: 2250,
                amountGross: 2250,
                amountGrossCurrency: 2250,
              },
              {
                row: 2,
                date: "2026-01-12",
                description: "Korrigering konto 7100 til 7140",
                account: { id: 710001 },
                currency: { id: 1 },
                amount: -2250,
                amountCurrency: -2250,
                amountGross: -2250,
                amountGrossCurrency: -2250,
              },
            ],
          });

          return { value: { id: 9001 } };
        }

        if (createdVoucherCount === 2) {
          assert.deepEqual(options?.body, {
            date: "2026-02-03",
            description: "MVA-korrigering: Programvarelisens",
            voucherType: null,
            postings: [
              {
                row: 1,
                date: "2026-02-03",
                description: "Manglande MVA-linje",
                account: { id: 271001 },
                currency: { id: 1 },
                amount: 5500,
                amountCurrency: 5500,
                amountGross: 5500,
                amountGrossCurrency: 5500,
              },
              {
                row: 2,
                date: "2026-02-03",
                description: "Manglande MVA-linje",
                account: { id: 240002 },
                supplier: { id: 88 },
                currency: { id: 1 },
                invoiceNumber: "LEV-8841",
                termOfPayment: "NETT14",
                amount: -5500,
                amountCurrency: -5500,
                amountGross: -5500,
                amountGrossCurrency: -5500,
              },
            ],
          });

          return { value: { id: 9003 } };
        }

        if (createdVoucherCount === 3) {
          assert.deepEqual(options?.body, {
            date: "2026-02-17",
            description: "Beløpskorrigering: Kursavgift",
            voucherType: null,
            postings: [
              {
                row: 1,
                date: "2026-02-17",
                description: "Korrigering 8650 til 7900",
                account: { id: 686001 },
                currency: { id: 1 },
                amount: -750,
                amountCurrency: -750,
                amountGross: -750,
                amountGrossCurrency: -750,
              },
              {
                row: 2,
                date: "2026-02-17",
                description: "Korrigering 8650 til 7900",
                account: { id: 240003 },
                supplier: { id: 99 },
                currency: { id: 1 },
                invoiceNumber: "KURS-2026-09",
                amount: 750,
                amountCurrency: 750,
                amountGross: 750,
                amountGrossCurrency: 750,
              },
            ],
          });

          return { value: { id: 9004 } };
        }

        throw new Error(`Unexpected extra POST ${path}`);
      },
      async put(path, options) {
        calls.push({
          method: "PUT",
          path,
          query: options?.query as Record<string, unknown> | undefined,
        });

        assert.equal(path, "/ledger/voucher/202/:reverse");
        assert.deepEqual(options?.query, { date: "2026-01-20" });
        return { value: { id: 9002 } };
      },
    }),
    {},
  );

  assert.deepEqual(
    calls.map((call) => `${call.method} ${call.path}`),
    [
      "GET /ledger/voucher",
      "GET /ledger/account",
      "POST /ledger/voucher",
      "PUT /ledger/voucher/202/:reverse",
      "POST /ledger/voucher",
      "POST /ledger/voucher",
    ],
  );
  assert.equal((result as { status?: string }).status, "completed");
  assert.deepEqual(result.createdEntityIds, {
    wrongAccountCorrectionVoucherId: 9001,
    duplicateReverseVoucherId: 9002,
    missingVatCorrectionVoucherId: 9003,
    wrongAmountCorrectionVoucherId: 9004,
  });
  assert.deepEqual(result.verification, {
    wrongAccountVoucherId: 101,
    duplicateVoucherId: 202,
    missingVatVoucherId: 301,
    wrongAmountVoucherId: 401,
    wrongAccountCorrectionAmount: 2250,
    missingVatAmount: 5500,
    wrongAmountDelta: 750,
  });
});

function createContext(handlers: {
  get(path: string, options?: TripletexRequestOptions): Promise<unknown>;
  post(path: string, options?: TripletexRequestOptions): Promise<unknown>;
  put(path: string, options?: TripletexRequestOptions): Promise<unknown>;
}): {
  clock: { today(): string };
  fetch: TripletexClient;
  tripletex: TripletexClient;
} {
  const client: TripletexClient = {
    async get<TResponse>(path: string, options?: TripletexRequestOptions) {
      return (await handlers.get(path, options)) as TResponse;
    },
    async post<TResponse>(path: string, options?: TripletexRequestOptions) {
      return (await handlers.post(path, options)) as TResponse;
    },
    async put<TResponse>(path: string, options?: TripletexRequestOptions) {
      return (await handlers.put(path, options)) as TResponse;
    },
  };

  const unexpectedClient: TripletexClient = {
    async get() {
      throw new Error("strategy should prefer ctx.fetch over ctx.tripletex");
    },
    async post() {
      throw new Error("strategy should prefer ctx.fetch over ctx.tripletex");
    },
    async put() {
      throw new Error("strategy should prefer ctx.fetch over ctx.tripletex");
    },
  };

  return {
    clock: {
      today() {
        return "2026-03-21";
      },
    },
    fetch: client,
    tripletex: unexpectedClient,
  };
}
