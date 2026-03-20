const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "HsNNrzT3-nKTEGyyDEv2lU32oMQNNVHW38g6X7tZYi8";
const PAYMENT_DATE = "2026-03-20";
const TARGET_ORG_NR = "866440034";
const TARGET_DESCRIPTION = "Almacenamiento en la nube";
const TARGET_EX_VAT_AMOUNT = 30000;

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

function buildUrl(path: string, query?: Record<string, string>): string {
  const base = BASE_URL.endsWith("/") ? BASE_URL.slice(0, -1) : BASE_URL;
  const url = new URL(`${base}/${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.append(key, value);
    }
  }
  return url.toString();
}

function authHeader(): string {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function unwrapValue<T>(data: any): T {
  return (data && typeof data === "object" && "value" in data ? data.value : data) as T;
}

function unwrapValues<T>(data: any): T[] {
  return Array.isArray(data?.values) ? (data.values as T[]) : [];
}

async function api<T>(
  method: string,
  path: string,
  query?: Record<string, string>,
): Promise<T> {
  const response = await fetch(buildUrl(path, query), {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
    },
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as Json) : null;

  if (response.status === 403) {
    const error = (data as any)?.error;
    if (
      error === "Invalid or expired token" ||
      error ===
        "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions."
    ) {
      throw new Error(`BLOCKED_CREDENTIALS: ${error}`);
    }
  }

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText} for ${method} ${path}: ${text}`,
    );
  }

  return data as T;
}

function invoiceEvidenceTexts(invoice: any): string[] {
  const texts: string[] = [];
  const push = (value: unknown) => {
    const normalized = normalizeText(value);
    if (normalized) {
      texts.push(normalized);
    }
  };

  push(invoice?.invoiceComment);
  push(invoice?.comment);
  push(invoice?.customerReference);
  push(invoice?.description);

  for (const line of invoice?.orderLines ?? []) {
    push(line?.description);
    push(line?.displayName);
    push(line?.name);
  }

  for (const order of invoice?.orders ?? []) {
    push(order?.invoiceComment);
    push(order?.description);
    for (const line of order?.orderLines ?? []) {
      push(line?.description);
      push(line?.displayName);
      push(line?.name);
    }
  }

  return texts;
}

function selectInvoice(invoices: any[]): any {
  const wantedDescription = normalizeText(TARGET_DESCRIPTION);
  const matches = invoices.filter((invoice) => {
    const orgNr = String(invoice?.customer?.organizationNumber ?? "");
    const exVat =
      toNumber(invoice?.amountExcludingVatCurrency) ??
      toNumber(invoice?.amountExcludingVat);
    const outstanding =
      toNumber(invoice?.amountCurrencyOutstanding) ??
      toNumber(invoice?.amountOutstanding) ??
      0;
    const texts = invoiceEvidenceTexts(invoice);

    return (
      orgNr === TARGET_ORG_NR &&
      exVat === TARGET_EX_VAT_AMOUNT &&
      outstanding > 0 &&
      texts.includes(wantedDescription)
    );
  });

  if (matches.length !== 1) {
    throw new Error(`Expected exactly 1 matching invoice, got ${matches.length}`);
  }

  return matches[0];
}

function paymentTypeScore(paymentType: any): number {
  const name = normalizeText(paymentType?.name);
  const debit = paymentType?.debitAccount ?? {};
  const credit = paymentType?.creditAccount ?? {};
  const debitNumber = String(debit?.number ?? "");
  const creditNumber = String(credit?.number ?? "");

  let score = 0;
  if (debit?.isBankAccount === true) score += 100;
  if (debit?.isInvoiceAccount === true) score += 30;
  if (/^19\d\d$/.test(debitNumber)) score += 20;
  if (/bank|betal|innbet|deposit|konto/.test(name)) score += 10;
  if (creditNumber === "") score += 2;
  return score;
}

function selectPaymentType(paymentTypes: any[]): any {
  const ranked = [...paymentTypes].sort((a, b) => paymentTypeScore(b) - paymentTypeScore(a));
  if (ranked.length === 0) {
    throw new Error("No payment types returned");
  }
  return ranked[0];
}

function extractRemainingOutstanding(paymentResponse: any): number | null {
  const candidates = [
    paymentResponse?.remainingOutstanding,
    paymentResponse?.amountCurrencyOutstanding,
    paymentResponse?.amountOutstanding,
  ];
  for (const candidate of candidates) {
    const value = toNumber(candidate);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

const invoiceSearchQuery = {
  invoiceDateFrom: "2020-01-01",
  invoiceDateTo: "2030-12-31",
  count: "1000",
  sorting: "-invoiceDate",
  fields: "*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))",
};

const paymentTypeQuery = {
  count: "1000",
  fields: "*,debitAccount(*),creditAccount(*)",
};

async function main(): Promise<void> {
  const invoiceList = await api<any>("GET", "invoice", invoiceSearchQuery);
  const invoice = selectInvoice(unwrapValues<any>(invoiceList));

  const outstanding =
    toNumber(invoice?.amountCurrencyOutstanding) ??
    toNumber(invoice?.amountOutstanding);
  if (outstanding === null || outstanding <= 0) {
    throw new Error("Located invoice does not have a positive outstanding amount");
  }

  const paymentTypeList = await api<any>("GET", "invoice/paymentType", paymentTypeQuery);
  const paymentType = selectPaymentType(unwrapValues<any>(paymentTypeList));
  const paymentTypeId = paymentType?.id;
  if (!paymentTypeId) {
    throw new Error("Resolved payment type is missing id");
  }

  const paymentResponseRaw = await api<any>(
    "PUT",
    `invoice/${invoice.id}/:payment`,
    {
      paymentDate: PAYMENT_DATE,
      paymentTypeId: String(paymentTypeId),
      paidAmount: String(outstanding),
    },
  );
  const paymentResponse = unwrapValue<any>(paymentResponseRaw);
  const remainingOutstanding = extractRemainingOutstanding(paymentResponse);

  if (remainingOutstanding === null) {
    throw new Error("Payment response did not expose remaining outstanding amount");
  }
  if (remainingOutstanding !== 0) {
    throw new Error(`Invoice still outstanding after payment: ${remainingOutstanding}`);
  }

  console.log(
    JSON.stringify({
      invoiceId: invoice.id,
      paymentTypeId,
      paidAmount: outstanding,
      remainingOutstanding,
    }),
  );
}

await main();
