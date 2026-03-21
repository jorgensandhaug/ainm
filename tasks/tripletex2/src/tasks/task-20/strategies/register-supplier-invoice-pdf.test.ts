import assert from "node:assert/strict";
import test from "node:test";

import type {
  StrategyRequestFile,
  TripletexClient,
  TripletexRequestOptions,
} from "../../../runtime/contracts";
import { strategy } from "./register-supplier-invoice-pdf";

test("task 20 strategy uploads the matched PDF attachment after booking the supplier invoice", async () => {
  const calls: string[] = [];
  let uploadedAttachmentName = "";
  let uploadedAttachmentType = "";
  let uploadedAttachmentBytes = "";

  const result = await strategy.run(
    createTripletexStub(
      {
        async get(path) {
          calls.push(`GET ${path}`);

          if (path === "/ledger/account") {
            return {
              values: [
                {
                  id: 424191158,
                  number: 6340,
                  isApplicableForSupplierInvoice: true,
                },
              ],
            };
          }

          if (path === "/ledger/vatType") {
            return {
              values: [{ id: 1, number: "1", percentage: 25 }],
            };
          }

          throw new Error(`Unexpected GET ${path}`);
        },
        async post(path, options) {
          calls.push(`POST ${path}`);

          if (path === "/supplier") {
            return {
              value: {
                id: 108283334,
                ledgerAccount: { id: 424190921 },
              },
            };
          }

          if (path === "/ledger/voucher/importDocument") {
            assert.ok(options?.rawBody instanceof FormData);
            return {
              values: [{ id: 608865450, version: 4 }],
            };
          }

          if (path === "/ledger/voucher/608865450/attachment") {
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
                id: 608865450,
                attachmentId: 9931,
              },
            };
          }

          throw new Error(`Unexpected POST ${path}`);
        },
        async put(path, options) {
          calls.push(`PUT ${path}`);

          if (path === "/ledger/voucher/608865450") {
            assert.deepEqual(options?.query, { sendToLedger: false });
            return {
              value: createVoucherResponse({
                voucherId: 608865450,
                expenseAccountId: 424191158,
                supplierId: 108283334,
                supplierLedgerAccountId: 424190921,
                vatTypeId: 1,
                invoiceNumber: "INV-2026-5401",
                dueDate: "2026-04-24",
                netAmount: 39800,
                grossAmount: 49750,
                vatAmount: 9950,
              }),
            };
          }

          throw new Error(`Unexpected PUT ${path}`);
        },
      },
      [
        {
          fileName: "files/leverandorfaktura_es_05.pdf",
          mediaType: "application/pdf",
          textContent: "ignored OCR text",
          contentBase64: Buffer.from("pdf-bytes-here", "utf8").toString("base64"),
        },
      ],
    ),
    {
      supplierName: "Luna SL",
      organizationNumber: "828324179",
      invoiceNumber: "INV-2026-5401",
      lineDescription: "Sikkerhetsprogramvare",
      grossAmountNok: 49750,
      expenseAccountNumber: 6340,
      vatRatePercent: 25,
      invoiceDate: "2026-03-25",
      dueDate: "2026-04-24",
      attachmentFileName: "files/leverandorfaktura_es_05.pdf",
    },
  );

  assert.deepEqual(calls, [
    "POST /supplier",
    "GET /ledger/account",
    "GET /ledger/vatType",
    "POST /ledger/voucher/importDocument",
    "PUT /ledger/voucher/608865450",
    "POST /ledger/voucher/608865450/attachment",
  ]);
  assert.equal(uploadedAttachmentName, "leverandorfaktura_es_05.pdf");
  assert.equal(uploadedAttachmentType, "application/pdf");
  assert.equal(uploadedAttachmentBytes, "pdf-bytes-here");
  assert.deepEqual(result.createdEntityIds, {
    supplierId: 108283334,
    voucherId: 608865450,
  });
  assert.equal(result.verification?.attachmentUploaded, true);
});

test("task 20 strategy rejects request attachments without raw PDF content", async () => {
  await assert.rejects(
    strategy.run(
      createTripletexStub({}, [
        {
          fileName: "files/leverandorfaktura_es_05.pdf",
          mediaType: "application/pdf",
          textContent: "ocr only",
        },
      ]),
      {
        supplierName: "Luna SL",
        organizationNumber: "828324179",
        invoiceNumber: "INV-2026-5401",
        lineDescription: "Sikkerhetsprogramvare",
        grossAmountNok: 49750,
        expenseAccountNumber: 6340,
        vatRatePercent: 25,
        attachmentFileName: "files/leverandorfaktura_es_05.pdf",
      },
    ),
    /did not include raw content needed for voucher upload/,
  );
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
): {
  clock: { today(): string };
  request: { prompt: string; files: readonly StrategyRequestFile[] };
  tripletex: TripletexClient;
} {
  return {
    clock: {
      today() {
        return "2026-03-20";
      },
    },
    request: {
      prompt: "Register supplier invoice from PDF.",
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

function createVoucherResponse(input: {
  voucherId: number;
  expenseAccountId: number;
  supplierId: number;
  supplierLedgerAccountId: number;
  vatTypeId: number;
  invoiceNumber: string;
  dueDate: string;
  netAmount: number;
  grossAmount: number;
  vatAmount: number;
}) {
  return {
    id: input.voucherId,
    postings: [
      {
        row: 1,
        amount: input.netAmount,
        amountGross: input.grossAmount,
        account: { id: input.expenseAccountId },
        vatType: { id: input.vatTypeId },
      },
      {
        row: 2,
        amount: -input.grossAmount,
        amountGross: -input.grossAmount,
        invoiceNumber: input.invoiceNumber,
        termOfPayment: input.dueDate,
        account: { id: input.supplierLedgerAccountId },
        supplier: { id: input.supplierId },
      },
      {
        row: 3,
        amount: input.vatAmount,
        amountGross: input.vatAmount,
        account: { id: 424190999 },
      },
    ],
  };
}
