const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "JODSKXhScuzieSzxAIVX_0NehDdV67FXvzsMN7JxPfE";
const PAYMENT_DATE = "2026-03-20";
const TARGET_ORG_NO = "830362894";
const TARGET_EX_VAT = 32200;
const TARGET_TEXT = "System Development";

const baseUrl = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type ListResponse<T> = {
  values?: T[];
  fullResultSize?: number;
};

type Invoice = {
  id: number;
  invoiceDate?: string;
  customer?: { id?: number; name?: string; organizationNumber?: string | number | null } | null;
  currency?: { code?: string | null } | null;
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

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractEvidence(invoice: Invoice): string[] {
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
  return texts;
}

function outstandingAmount(invoice: Invoice): number | null {
  return normalizeNumber(invoice.amountCurrencyOutstanding) ?? normalizeNumber(invoice.amountOutstanding);
}

function exVatAmount(invoice: Invoice): number | null {
  return normalizeNumber(invoice.amountExcludingVatCurrency) ?? normalizeNumber(invoice.amountExcludingVat);
}

async function tripletexFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = new URL(path, baseUrl);
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const errorText = typeof data === "object" && data ? JSON.stringify(data) : text;
    throw new Error(`${response.status} ${response.statusText} ${errorText}`);
  }

  return data as T;
}

function choosePaymentType(values: PaymentType[]): PaymentType {
  const scored = values
    .map((paymentType) => {
      const debitNumber = String(paymentType.debitAccount?.number ?? "");
      const name = normalizeText(paymentType.name);
      let score = 0;
      if (debitNumber.startsWith("19")) score += 4;
      if (paymentType.debitAccount?.isBankAccount) score += 3;
      if (paymentType.debitAccount?.isInvoiceAccount) score += 2;
      if (name.includes("bank")) score += 1;
      return { paymentType, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0]?.paymentType;
  if (!best) throw new Error("No payment types returned");
  return best;
}

async function main() {
  const invoiceQuery = new URLSearchParams({
    invoiceDateFrom: "2024-01-01",
    invoiceDateTo: "2027-12-31",
    count: "1000",
    sorting: "-invoiceDate",
    fields: "*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))",
  });
  const invoiceList = await tripletexFetch<ListResponse<Invoice>>(`invoice?${invoiceQuery.toString()}`);
  const candidates = (invoiceList.values ?? []).filter((invoice) => {
    const orgNo = String(invoice.customer?.organizationNumber ?? "");
    const exVat = exVatAmount(invoice);
    const outstanding = outstandingAmount(invoice);
    const texts = extractEvidence(invoice).map(normalizeText);
    return (
      orgNo === TARGET_ORG_NO &&
      exVat === TARGET_EX_VAT &&
      outstanding !== null &&
      outstanding > 0 &&
      texts.includes(normalizeText(TARGET_TEXT))
    );
  });

  if (candidates.length !== 1) {
    throw new Error(`Expected exactly 1 matching invoice, found ${candidates.length}`);
  }

  const invoice = candidates[0];
  const amountToPay = outstandingAmount(invoice);
  if (amountToPay === null) {
    throw new Error(`Invoice ${invoice.id} has no outstanding amount`);
  }

  const paymentTypeList = await tripletexFetch<ListResponse<PaymentType>>(
    "invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)",
  );
  const paymentType = choosePaymentType(paymentTypeList.values ?? []);

  const paymentQuery = new URLSearchParams({
    paymentDate: PAYMENT_DATE,
    paymentTypeId: String(paymentType.id),
    paidAmount: String(amountToPay),
  });
  const paymentResponse = await tripletexFetch<{ value?: Invoice }>(
    `invoice/${invoice.id}/:payment?${paymentQuery.toString()}`,
    { method: "PUT" },
  );

  const paidInvoice = paymentResponse.value;
  if (!paidInvoice) {
    throw new Error("Payment response missing invoice value");
  }

  const remaining = outstandingAmount(paidInvoice);
  if (remaining !== 0) {
    throw new Error(`Payment did not fully settle invoice ${invoice.id}; remaining ${remaining}`);
  }

  console.log(
    JSON.stringify({
      invoiceId: invoice.id,
      paidAmount: amountToPay,
      paymentTypeId: paymentType.id,
      remainingOutstanding: remaining,
    }),
  );
}

await main();
