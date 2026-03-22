import assert from "node:assert/strict";
import test from "node:test";

import type {
  StrategyRequestFile,
  TripletexClient,
  TripletexRequestOptions,
} from "../../../runtime/contracts";
import { TripletexHttpError } from "../../../runtime/tripletex-client";
import { strategy } from "./receipt-expense-booking";

test("task 22 strategy books a travel receipt to department, picks VAT, and uploads the receipt", async () => {
  const calls: string[] = [];
  let uploadedAttachmentName = "";
  let uploadedAttachmentType = "";
  let uploadedAttachmentBytes = "";
  let capturedVoucherBody: unknown;

  const result = await strategy.run(
    createTripletexStub(
      {
        async get(path, options) {
          calls.push(`GET ${path}`);

          if (path === "/department") {
            assert.deepEqual(options?.query, {
              name: "Utvikling",
              isInactive: false,
              fields: "*",
            });
            return {
              values: [{ id: 933707, name: "Utvikling", isInactive: false }],
            };
          }

          if (path === "/ledger/account") {
            assert.deepEqual(options?.query, {
              number: "1920,6540,6860,7100,7130,7140,7141,7149,7150,7160,7170,7320,7330,7350,7360",
              fields: "*",
            });
            return {
              values: [
                { id: 424190862, number: 1920, isBankAccount: true },
                {
                  id: 463811350,
                  number: 7140,
                  name: "Reisekostnad, ikke oppgavepliktig",
                  displayName: "7140 Reisekostnad, ikke oppgavepliktig",
                  vatLocked: false,
                },
                {
                  id: 463811349,
                  number: 7130,
                  name: "Reisekostnad, oppgavepliktig",
                  displayName: "7130 Reisekostnad, oppgavepliktig",
                  vatLocked: false,
                },
              ],
            };
          }

          if (path === "/ledger/vatType") {
            assert.deepEqual(options?.query, {
              typeOfVat: "INCOMING",
              vatDate: "2026-04-13",
              fields: "*",
            });
            return {
              values: [
                {
                  id: 12,
                  number: "12",
                  percentage: 12,
                  deductionPercentage: 100,
                },
                {
                  id: 1,
                  number: "1",
                  percentage: 25,
                  deductionPercentage: 100,
                },
              ],
            };
          }

          throw new Error(`Unexpected GET ${path}`);
        },
        async post(path, options) {
          calls.push(`POST ${path}`);

          if (path === "/department") {
            throw new TripletexHttpError({
              status: 409,
              path,
              message: "Conflict",
            });
          }

          if (path === "/ledger/voucher?sendToLedger=true") {
            capturedVoucherBody = options?.body;
            return {
              value: {
                id: 608968443,
                number: 1,
                postings: [
                  {
                    row: 1,
                    amount: 10133.93,
                    amountGross: 11350,
                    account: { id: 463811350 },
                    department: { id: 933707 },
                    vatType: { id: 12 },
                  },
                  {
                    row: 2,
                    amountGross: -11350,
                    account: { id: 424190862 },
                  },
                ],
              },
            };
          }

          if (path === "/ledger/voucher/608968443/attachment") {
            assert.ok(options?.rawBody instanceof FormData);
            const file = options.rawBody.get("file");
            assert.ok(file instanceof File);
            uploadedAttachmentName = file.name;
            uploadedAttachmentType = file.type;
            uploadedAttachmentBytes = Buffer.from(
              await file.arrayBuffer(),
            ).toString("utf8");
            return {
              value: {
                id: 608968443,
                attachment: { id: 1024233990 },
              },
            };
          }

          throw new Error(`Unexpected POST ${path}`);
        },
      },
      [
        {
          fileName: "files/kvittering_nb_05.pdf",
          mediaType: "application/pdf",
          textContent:
            "Togbillett 113,50 kr MVA 12% Betalt med kort på reise.",
          contentBase64: Buffer.from("pdf-bytes-here", "utf8").toString("base64"),
        },
      ],
      "Vi trenger Togbillett fra denne kvitteringen bokfort pa avdeling Utvikling. Bruk riktig utgiftskonto basert pa kjopet, og sorg for korrekt MVA-behandling.",
    ),
    {
      departmentName: "Utvikling",
      lineDescription: "Togbillett",
      grossAmountNok: 11350,
      voucherDate: "2026-04-13",
      attachmentFileName: "files/kvittering_nb_05.pdf",
    },
  );

  assert.deepEqual(calls, [
    "POST /department",
    "GET /department",
    "GET /ledger/account",
    "GET /ledger/vatType",
    "POST /ledger/voucher?sendToLedger=true",
    "POST /ledger/voucher/608968443/attachment",
  ]);
  assert.deepEqual(capturedVoucherBody, {
    date: "2026-04-13",
    description: "Togbillett",
    voucherType: null,
    postings: [
      {
        row: 1,
        date: "2026-04-13",
        description: "Togbillett",
        account: { id: 463811350 },
        department: { id: 933707 },
        vatType: { id: 12 },
        amountGross: 11350,
        amountGrossCurrency: 11350,
      },
      {
        row: 2,
        date: "2026-04-13",
        description: "Togbillett",
        account: { id: 424190862 },
        amountGross: -11350,
        amountGrossCurrency: -11350,
      },
    ],
  });
  assert.equal(uploadedAttachmentName, "kvittering_nb_05.pdf");
  assert.equal(uploadedAttachmentType, "application/pdf");
  assert.equal(uploadedAttachmentBytes, "pdf-bytes-here");
  assert.deepEqual(result.createdEntityIds, {
    departmentId: 933707,
    voucherId: 608968443,
    attachmentId: 1024233990,
  });
  assert.equal(result.verification?.expenseAccountNumber, 7140);
  assert.equal(result.verification?.vatTypeId, 12);
  assert.equal(result.verification?.attachmentUploaded, true);
});

test("task 22 strategy chooses the non-deductible representation account and skips VAT lookup when the account is VAT-locked", async () => {
  const calls: string[] = [];
  let capturedVoucherBody: unknown;

  const result = await strategy.run(
    createTripletexStub(
      {
        async get(path, options) {
          calls.push(`GET ${path}`);

          if (path === "/department") {
            assert.deepEqual(options?.query, {
              name: "Drift",
              isInactive: false,
              fields: "*",
            });
            return {
              values: [
                { id: 927069, name: "Drift sandbox copy", isInactive: false },
                { id: 927070, name: "Drift", isInactive: false },
              ],
            };
          }

          if (path === "/ledger/account") {
            return {
              values: [
                { id: 424190862, number: 1920, isBankAccount: true },
                {
                  id: 424191173,
                  number: 7350,
                  displayName: "7350 Representasjon, fradragsberettiget",
                  vatLocked: true,
                  vatType: { id: 0, percentage: 0 },
                },
                {
                  id: 424191174,
                  number: 7360,
                  displayName: "7360 Representasjon, ikke fradragsberettiget",
                  vatLocked: true,
                  vatType: { id: 0, percentage: 0 },
                },
              ],
            };
          }

          throw new Error(`Unexpected GET ${path}`);
        },
        async post(path, options) {
          calls.push(`POST ${path}`);

          if (path === "/ledger/voucher?sendToLedger=true") {
            capturedVoucherBody = options?.body;
            return {
              value: {
                id: 608898560,
                number: 44,
                postings: [
                  {
                    row: 1,
                    amount: 13650,
                    amountGross: 13650,
                    account: { id: 424191174 },
                    department: { id: 927070 },
                    vatType: { id: 0 },
                  },
                  {
                    row: 2,
                    amountGross: -13650,
                    account: { id: 424190862 },
                  },
                ],
              },
            };
          }

          if (path === "/ledger/voucher/608898560/attachment") {
            return {
              value: {
                id: 608898560,
                attachment: { id: 1024214336 },
              },
            };
          }

          throw new Error(`Unexpected POST ${path}`);
        },
      },
      [
        {
          fileName: "files/receipt.pdf",
          mediaType: "application/pdf",
          textContent:
            "Olivia Forretningslunsj 136,50 kr Betalt med Bedriftskort.",
          contentBase64: Buffer.from("representation-pdf", "utf8").toString(
            "base64",
          ),
        },
      ],
      "Bokfor Forretningslunsj fra denne kvitteringen pa avdeling Drift.",
    ),
    {
      departmentName: "Drift",
      lineDescription: "Forretningslunsj",
      grossAmountNok: 13650,
      voucherDate: "2026-01-30",
      attachmentFileName: "files/receipt.pdf",
      departmentAlreadyExists: true,
    },
  );

  assert.deepEqual(calls, [
    "GET /department",
    "GET /ledger/account",
    "POST /ledger/voucher?sendToLedger=true",
    "POST /ledger/voucher/608898560/attachment",
  ]);
  assert.deepEqual(capturedVoucherBody, {
    date: "2026-01-30",
    description: "Forretningslunsj",
    voucherType: null,
    postings: [
      {
        row: 1,
        date: "2026-01-30",
        description: "Forretningslunsj",
        account: { id: 424191174 },
        department: { id: 927070 },
        amountGross: 13650,
        amountGrossCurrency: 13650,
      },
      {
        row: 2,
        date: "2026-01-30",
        description: "Forretningslunsj",
        account: { id: 424190862 },
        amountGross: -13650,
        amountGrossCurrency: -13650,
      },
    ],
  });
  assert.equal(result.verification?.expenseAccountNumber, 7360);
  assert.equal(result.verification?.vatTypeId, 0);
  assert.equal(result.verification?.vatLocked, true);
});

function createTripletexStub(
  handlers: {
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
  },
  files: readonly StrategyRequestFile[],
  prompt = "Register receipt expense voucher.",
): {
  clock: { today(): string };
  request: { prompt: string; files: readonly StrategyRequestFile[] };
  tripletex: TripletexClient;
} {
  return {
    clock: {
      today() {
        return "2026-03-21";
      },
    },
    request: {
      prompt,
      files,
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
