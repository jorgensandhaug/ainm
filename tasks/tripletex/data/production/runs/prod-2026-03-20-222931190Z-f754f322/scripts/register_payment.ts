const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "FLXMCG_w3ysvQW2_Sl7Avjxoc1kbS3uLZmZyYkcwGSs";
const PAYMENT_DATE = "2026-03-20";
const TARGET_ORG = "909268265";
const TARGET_AMOUNT_EX_VAT = 31300;
const TARGET_TEXT = "Konsulenttimer";

type WrappedList<T> = {
  values?: T[];
};

type Invoice = {
  id: number;
  customer?: { organizationNumber?: string | number | null } | null;
  amountExcludingVatCurrency?: number | null;
  amountExcludingVat?: number | null;
  amountCurrencyOutstanding?: number | null;
  amountOutstanding?: number | null;
  orderLines?: Array<{
    description?: string | null;
    displayName?: string | null;
  }> | null;
  orders?: Array<{
    invoiceComment?: string | null;
    orderLines?: Array<{
      description?: string | null;
      displayName?: string | null;
    }> | null;
  }> | null;
};

type PaymentType = {
  id: number;
  name?: string | null;
  debitAccount?: {
    number?: string | number | null;
    isBankAccount?: boolean | null;
    isInvoiceAccount?: boolean | null;
  } | null;
  creditAccount?: {
    number?: string | number | null;
  } | null;
};

function authHeader() {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

function endpoint(path: string, params?: Record<string, string>) {
  const url = new URL(path, `${BASE_URL}/`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function request<T>(path: string, init: RequestInit = {}, params?: Record<string, string>): Promise<T> {
  const response = await fetch(endpoint(path, params), {
    ...init,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const errorText = typeof data?.error === "string" ? data.error : "";
    if (
      response.status === 403 &&
      (errorText === "Invalid or expired token" ||
        errorText === "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.")
    ) {
      throw new Error(`Blocked credentials: ${errorText}`);
    }
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return data as T;
}

function normalize(value: unknown) {
  return String(value ?? "").trim();
}

function invoiceEvidenceTexts(invoice: Invoice) {
  const texts: string[] = [];
  for (const line of invoice.orderLines ?? []) {
    if (line.description) texts.push(line.description);
    if (line.displayName) texts.push(line.displayName);
  }
  for (const order of invoice.orders ?? []) {
    if (order.invoiceComment) texts.push(order.invoiceComment);
    for (const line of order.orderLines ?? []) {
      if (line.description) texts.push(line.description);
      if (line.displayName) texts.push(line.displayName);
    }
  }
  return texts.map((text) => text.trim());
}

function outstandingAmount(invoice: Invoice) {
  return invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding ?? null;
}

function paymentTypeScore(paymentType: PaymentType) {
  const debitNumber = normalize(paymentType.debitAccount?.number);
  const name = normalize(paymentType.name).toLowerCase();
  let score = 0;
  if (paymentType.debitAccount?.isBankAccount) score += 8;
  if (paymentType.debitAccount?.isInvoiceAccount) score += 6;
  if (debitNumber.startsWith("19")) score += 4;
  if (name.includes("bank")) score += 2;
  if (name.includes("betalt")) score += 1;
  return score;
}

async function main() {
  const invoiceList = await request<WrappedList<Invoice>>("invoice", {}, {
    invoiceDateFrom: "2020-01-01",
    invoiceDateTo: "2030-12-31",
    count: "1000",
    sorting: "-invoiceDate",
    fields: "*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))",
  });

  const matches = (invoiceList.values ?? []).filter((invoice) => {
    const org = normalize(invoice.customer?.organizationNumber);
    const amount = invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat;
    const outstanding = outstandingAmount(invoice);
    const evidence = invoiceEvidenceTexts(invoice);
    return (
      org === TARGET_ORG &&
      amount === TARGET_AMOUNT_EX_VAT &&
      typeof outstanding === "number" &&
      outstanding > 0 &&
      evidence.includes(TARGET_TEXT)
    );
  });

  if (matches.length !== 1) {
    throw new Error(`Expected exactly 1 invoice match, got ${matches.length}`);
  }

  const invoice = matches[0];
  const paidAmount = outstandingAmount(invoice);
  if (typeof paidAmount !== "number" || !(paidAmount > 0)) {
    throw new Error("Located invoice does not have a positive outstanding amount");
  }

  const paymentTypeList = await request<WrappedList<PaymentType>>("invoice/paymentType", {}, {
    count: "1000",
    fields: "*,debitAccount(*),creditAccount(*)",
  });

  const paymentType = [...(paymentTypeList.values ?? [])]
    .sort((a, b) => paymentTypeScore(b) - paymentTypeScore(a))[0];

  if (!paymentType?.id) {
    throw new Error("Could not resolve a payment type");
  }

  const paymentResult = await request<{ value?: Invoice }>(
    `invoice/${invoice.id}/:payment`,
    { method: "PUT" },
    {
      paymentDate: PAYMENT_DATE,
      paymentTypeId: String(paymentType.id),
      paidAmount: String(paidAmount),
    },
  );

  const paidInvoice = paymentResult.value;
  const remaining = paidInvoice?.amountCurrencyOutstanding ?? paidInvoice?.amountOutstanding ?? null;
  if (remaining !== 0) {
    throw new Error(`Payment write did not settle invoice, remaining=${remaining}`);
  }

  console.log(
    JSON.stringify({
      invoiceId: invoice.id,
      paymentTypeId: paymentType.id,
      paidAmount,
      remainingOutstanding: remaining,
    }),
  );
}

await main();
