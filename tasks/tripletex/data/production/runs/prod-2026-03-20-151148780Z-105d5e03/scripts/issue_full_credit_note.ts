const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "gQppDrbTPR_aH-E_S7aRCfFkvmvO6MdHQ3BT82t08_k";

const TARGET = {
  organizationNumber: "955361490",
  amountExcludingVat: 45550,
  description: "Maintenance",
  creditDate: "2026-03-20",
  invoiceDateFrom: "2000-01-01",
  invoiceDateTo: "2026-03-21",
};

type InvoiceLike = {
  id: number;
  invoiceNumber?: string | number | null;
  invoiceDate?: string | null;
  isCreditNote?: boolean | null;
  isCredited?: boolean | null;
  amountExcludingVat?: number | null;
  amountExcludingVatCurrency?: number | null;
  customer?: {
    id?: number | null;
    name?: string | null;
    organizationNumber?: string | number | null;
  } | null;
  orderLines?: Array<{
    description?: string | null;
  }> | null;
  orders?: Array<{
    orderLines?: Array<{
      description?: string | null;
    }> | null;
  }> | null;
  creditedInvoice?: number | { id?: number | null } | null;
};

function authHeader() {
  return `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText} for ${path}\n${JSON.stringify(data, null, 2)}`,
    );
  }

  return data as T;
}

function getDescriptions(invoice: InvoiceLike): string[] {
  const direct = (invoice.orderLines ?? [])
    .map((line) => line.description?.trim())
    .filter((value): value is string => Boolean(value));

  const nested = (invoice.orders ?? []).flatMap((order) =>
    (order.orderLines ?? [])
      .map((line) => line.description?.trim())
      .filter((value): value is string => Boolean(value)),
  );

  return [...direct, ...nested];
}

function getCreditedInvoiceId(value: InvoiceLike["creditedInvoice"]): number | null {
  if (typeof value === "number") {
    return value;
  }
  if (value && typeof value === "object" && typeof value.id === "number") {
    return value.id;
  }
  return null;
}

async function main() {
  const search = new URLSearchParams({
    invoiceDateFrom: TARGET.invoiceDateFrom,
    invoiceDateTo: TARGET.invoiceDateTo,
    count: "1000",
    sorting: "-invoiceDate",
    fields: "*,customer(*),orderLines(*),orders(*,orderLines(*))",
  });

  const listResponse = await api<{ values?: InvoiceLike[] }>(`/invoice?${search.toString()}`);
  const invoices = listResponse.values ?? [];

  const matches = invoices.filter((invoice) => {
    if (invoice.isCreditNote === true || invoice.isCredited === true) {
      return false;
    }

    const org = String(invoice.customer?.organizationNumber ?? "").trim();
    if (org !== TARGET.organizationNumber) {
      return false;
    }

    const amount = invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat;
    if (amount !== TARGET.amountExcludingVat) {
      return false;
    }

    return getDescriptions(invoice).includes(TARGET.description);
  });

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one matching invoice, found ${matches.length}\n${JSON.stringify(
        matches.map((invoice) => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate,
          customer: invoice.customer,
          amountExcludingVat: invoice.amountExcludingVat,
          amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
          descriptions: getDescriptions(invoice),
        })),
        null,
        2,
      )}`,
    );
  }

  const original = matches[0];
  const createParams = new URLSearchParams({
    date: TARGET.creditDate,
    sendToCustomer: "false",
  });

  const creditResponse = await api<{ value?: InvoiceLike }>(
    `/invoice/${original.id}/:createCreditNote?${createParams.toString()}`,
    { method: "PUT" },
  );

  const credit = creditResponse.value;
  if (!credit) {
    throw new Error("Missing credit note response payload");
  }

  if (credit.isCreditNote !== true) {
    throw new Error(`Expected isCreditNote=true, got ${JSON.stringify(credit)}`);
  }

  const creditedInvoiceId = getCreditedInvoiceId(credit.creditedInvoice);
  if (creditedInvoiceId !== original.id) {
    throw new Error(
      `Expected creditedInvoice=${original.id}, got ${JSON.stringify(credit.creditedInvoice)}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        originalInvoiceId: original.id,
        originalInvoiceNumber: original.invoiceNumber ?? null,
        creditNoteId: credit.id,
        creditNoteNumber: credit.invoiceNumber ?? null,
        creditedInvoiceId,
      },
      null,
      2,
    ),
  );
}

await main();
