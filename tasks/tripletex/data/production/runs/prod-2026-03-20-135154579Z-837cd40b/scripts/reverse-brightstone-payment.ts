const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "GUiqZ7T76aFkwObpPDFKjaZWFcgLMRgwZvRVeYMqr08";

const TARGET_ORG_NO = "993125393";
const TARGET_DESCRIPTION = "Data Advisory";
const TARGET_EX_VAT = 27100;
const REVERSE_DATE = "2026-03-20";

const auth = Buffer.from(`0:${SESSION_TOKEN}`).toString("base64");

type Json = Record<string, any>;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(
      `${init?.method ?? "GET"} ${path} failed: ${res.status} ${res.statusText}\n${JSON.stringify(body, null, 2)}`,
    );
  }

  return body as T;
}

function approxEq(a: unknown, b: number): boolean {
  return typeof a === "number" && Math.abs(a - b) < 0.0001;
}

function hasTargetText(invoice: Json): boolean {
  const haystacks = [
    ...(invoice.orderLines ?? []).flatMap((line: Json) => [
      line.description,
      line.displayName,
      line.product?.name,
      line.product?.number,
    ]),
    ...(invoice.orders ?? []).flatMap((order: Json) => [
      order.invoiceComment,
      order.comment,
      order.name,
      order.description,
    ]),
    invoice.invoiceComment,
    invoice.comment,
    invoice.invoiceRemarks,
    invoice.invoiceRemark?.comment,
  ]
    .filter((value): value is string => typeof value === "string")
    .join("\n")
    .toLowerCase();

  return haystacks.includes(TARGET_DESCRIPTION.toLowerCase());
}

function getPaymentVoucherId(invoice: Json): number {
  const ids = new Map<number, Json>();

  for (const posting of invoice.postings ?? []) {
    const voucherId = posting?.voucher?.id;
    const type = posting?.type;
    const amount = posting?.amount;

    if (
      typeof voucherId === "number" &&
      (type === "INCOMING_PAYMENT" || type === "INCOMING_PAYMENT_OPPOSITE" || (typeof amount === "number" && amount < 0))
    ) {
      ids.set(voucherId, posting);
    }
  }

  const voucherIds = [...ids.keys()];
  if (voucherIds.length !== 1) {
    throw new Error(`Expected exactly 1 payment voucher candidate, got ${voucherIds.length}: ${voucherIds.join(", ")}`);
  }

  return voucherIds[0]!;
}

async function main() {
  const fields = [
    "*",
    "customer(*)",
    "currency(*)",
    "orderLines(*)",
    "orders(*)",
    "postings(*,voucher(*),account(*),customer(*),closeGroup(*))",
  ].join(",");

  const search = await api<{ values: Json[] }>(
    `/invoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2027-01-01&count=1000&sorting=-invoiceDate&fields=${encodeURIComponent(fields)}`,
  );

  const matches = (search.values ?? []).filter((invoice) => {
    const orgNo = invoice.customer?.organizationNumber;
    const exVat =
      typeof invoice.amountExcludingVatCurrency === "number"
        ? invoice.amountExcludingVatCurrency
        : invoice.amountExcludingVat;

    return orgNo === TARGET_ORG_NO && approxEq(exVat, TARGET_EX_VAT) && hasTargetText(invoice);
  });

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly 1 invoice match, got ${matches.length}\n${JSON.stringify(
        matches.map((invoice) => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
          amountCurrency: invoice.amountCurrency,
          amountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
          customerOrgNo: invoice.customer?.organizationNumber,
        })),
        null,
        2,
      )}`,
    );
  }

  const invoice = matches[0]!;
  const outstandingBefore = invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding;
  if (typeof outstandingBefore === "number" && outstandingBefore > 0) {
    throw new Error(`Invoice ${invoice.id} already has outstanding amount ${outstandingBefore}; refusing to reverse`);
  }

  const expectedOutstandingAfter = invoice.amountCurrency ?? invoice.amount;
  if (typeof expectedOutstandingAfter !== "number" || expectedOutstandingAfter <= 0) {
    throw new Error(`Invoice ${invoice.id} missing total amount for verification`);
  }

  const paymentVoucherId = getPaymentVoucherId(invoice);

  const reversed = await api<{ value: Json }>(
    `/ledger/voucher/${paymentVoucherId}/:reverse?date=${REVERSE_DATE}`,
    { method: "PUT" },
  );

  const reverseVoucherId = reversed.value?.id;
  if (typeof reverseVoucherId !== "number") {
    throw new Error(`Reverse call did not return a reverse voucher id: ${JSON.stringify(reversed, null, 2)}`);
  }

  const verify = await api<{ values: Json[] }>(
    `/invoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2027-01-01&id=${invoice.id}&fields=${encodeURIComponent(
      "*,customer(*),orderLines(*),postings(*,voucher(*))",
    )}`,
  );

  const verified = verify.values?.[0];
  if (!verified) {
    throw new Error(`Verification read did not return invoice ${invoice.id}`);
  }

  const outstandingAfter = verified.amountCurrencyOutstanding ?? verified.amountOutstanding;
  if (!approxEq(outstandingAfter, expectedOutstandingAfter)) {
    throw new Error(
      `Outstanding amount not restored as expected for invoice ${invoice.id}. Expected ${expectedOutstandingAfter}, got ${outstandingAfter}\n${JSON.stringify(
        {
          invoiceId: verified.id,
          invoiceNumber: verified.invoiceNumber,
          amountCurrency: verified.amountCurrency,
          amountCurrencyOutstanding: verified.amountCurrencyOutstanding,
          amountOutstanding: verified.amountOutstanding,
          postings: verified.postings,
        },
        null,
        2,
      )}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        invoiceId: verified.id,
        invoiceNumber: verified.invoiceNumber,
        reverseVoucherId,
        outstandingBefore,
        outstandingAfter,
      },
      null,
      2,
    ),
  );
}

await main();
