const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const baseUrl = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type ListResponse<T> = {
  values?: T[];
};

type Invoice = {
  id: number;
  invoiceDate?: string | null;
  customer?: {
    organizationNumber?: string | number | null;
    name?: string | null;
  } | null;
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

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function outstanding(invoice: Invoice): number | null {
  return numberValue(invoice.amountCurrencyOutstanding) ?? numberValue(invoice.amountOutstanding);
}

function exVat(invoice: Invoice): number | null {
  return numberValue(invoice.amountExcludingVatCurrency) ?? numberValue(invoice.amountExcludingVat);
}

function evidenceTexts(invoice: Invoice): string[] {
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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(new URL(path, baseUrl), {
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
    throw new Error(`${response.status} ${response.statusText} ${JSON.stringify(data)}`);
  }
  return data as T;
}

function choosePaymentType(values: PaymentType[]): PaymentType {
  const winner = values
    .map((paymentType) => {
      let score = 0;
      const debitNumber = String(paymentType.debitAccount?.number ?? "");
      const name = (paymentType.name ?? "").toLowerCase();
      if (debitNumber.startsWith("19")) score += 4;
      if (paymentType.debitAccount?.isBankAccount) score += 3;
      if (paymentType.debitAccount?.isInvoiceAccount) score += 2;
      if (name.includes("bank")) score += 1;
      return { paymentType, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.paymentType;

  if (!winner) throw new Error("No payment types returned");
  return winner;
}

async function main() {
  const invoiceQuery = new URLSearchParams({
    invoiceDateFrom: "2020-01-01",
    invoiceDateTo: "2030-12-31",
    count: "1000",
    sorting: "-invoiceDate",
    fields: "*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))",
  });
  const invoiceList = await api<ListResponse<Invoice>>(`invoice?${invoiceQuery.toString()}`);
  const candidate = (invoiceList.values ?? []).find((invoice) => {
    const openAmount = outstanding(invoice);
    return openAmount !== null && openAmount > 0 && evidenceTexts(invoice).length > 0;
  });

  if (!candidate) {
    throw new Error("No open invoice with textual evidence found");
  }

  const invoiceFields = Object.keys(candidate).filter((key) => key.toLowerCase().includes("payment"));
  const paymentTypeList = await api<ListResponse<PaymentType>>(
    "invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)",
  );
  const paymentType = choosePaymentType(paymentTypeList.values ?? []);

  const paymentQuery = new URLSearchParams({
    paymentDate: "2026-03-20",
    paymentTypeId: String(paymentType.id),
    paidAmount: String(outstanding(candidate)),
  });
  const paid = await api<{ value?: Invoice }>(`invoice/${candidate.id}/:payment?${paymentQuery.toString()}`, {
    method: "PUT",
  });

  console.log(
    JSON.stringify({
      locatedInvoiceId: candidate.id,
      locatedCustomerOrgNo: String(candidate.customer?.organizationNumber ?? ""),
      locatedCustomerName: candidate.customer?.name ?? null,
      locatedExVat: exVat(candidate),
      locatedOutstanding: outstanding(candidate),
      locatedEvidence: evidenceTexts(candidate),
      invoicePaymentRelatedFields: invoiceFields,
      chosenPaymentTypeId: paymentType.id,
      chosenPaymentTypeName: paymentType.name ?? null,
      remainingOutstanding:
        paid.value ? outstanding(paid.value) : null,
    }),
  );
}

await main();
