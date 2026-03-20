const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "IX8l28Pvi0JcZf-OcQBEURim2Jjv67RQIyGHfBe2TmA";
const RUN_DATE = "2026-03-20";
const SEARCH_TO_DATE = "2026-03-21";
const TARGET_ORG_NO = "973999966";
const TARGET_DESCRIPTION = "Conseil en données";
const TARGET_AMOUNT_EX_VAT = 40800;

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type TripletexListResponse<T> = {
  values?: T[];
  fullResultSize?: number;
};

type TripletexValueResponse<T> = {
  value?: T;
};

type InvoiceLine = {
  description?: string | null;
};

type Invoice = {
  id?: number;
  invoiceNumber?: number | string;
  isCreditNote?: boolean;
  isCredited?: boolean;
  amountExcludingVatCurrency?: number | null;
  amountExcludingVat?: number | null;
  customer?: {
    organizationNumber?: string | null;
  } | null;
  orderLines?: InvoiceLine[] | null;
  orders?: Array<{
    orderLines?: InvoiceLine[] | null;
  }> | null;
  creditedInvoice?: {
    id?: number;
  } | number | null;
};

function getAllDescriptions(invoice: Invoice): string[] {
  const direct = (invoice.orderLines ?? [])
    .map((line) => line?.description)
    .filter((value): value is string => Boolean(value));

  const nested = (invoice.orders ?? []).flatMap((order) =>
    (order.orderLines ?? [])
      .map((line) => line?.description)
      .filter((value): value is string => Boolean(value)),
  );

  return [...direct, ...nested];
}

function getAmountExVat(invoice: Invoice): number | null {
  if (typeof invoice.amountExcludingVatCurrency === "number") {
    return invoice.amountExcludingVatCurrency;
  }
  if (typeof invoice.amountExcludingVat === "number") {
    return invoice.amountExcludingVat;
  }
  return null;
}

async function tripletexFetch<T>(pathWithQuery: string, init?: RequestInit): Promise<T> {
  const url = `${BASE_URL}/${pathWithQuery}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${pathWithQuery}: ${body}`);
  }

  return (await response.json()) as T;
}

async function main() {
  const query = new URLSearchParams({
    invoiceDateFrom: "2000-01-01",
    invoiceDateTo: SEARCH_TO_DATE,
    count: "1000",
    sorting: "-invoiceDate",
    fields: "*,customer(*),orderLines(*),orders(*,orderLines(*))",
  });

  const invoiceList = await tripletexFetch<TripletexListResponse<Invoice>>(`invoice?${query.toString()}`);
  const candidates = (invoiceList.values ?? []).filter((invoice) => {
    if (!invoice.id) return false;
    if (invoice.isCreditNote === true) return false;
    if (invoice.isCredited === true) return false;
    if (invoice.customer?.organizationNumber !== TARGET_ORG_NO) return false;
    if (getAmountExVat(invoice) !== TARGET_AMOUNT_EX_VAT) return false;
    return getAllDescriptions(invoice).includes(TARGET_DESCRIPTION);
  });

  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one invoice match, found ${candidates.length}: ${JSON.stringify(
        candidates.map((invoice) => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          orgNo: invoice.customer?.organizationNumber,
          amountExVat: getAmountExVat(invoice),
          isCreditNote: invoice.isCreditNote,
          isCredited: invoice.isCredited,
          descriptions: getAllDescriptions(invoice),
        })),
      )}`,
    );
  }

  const originalInvoice = candidates[0];
  const creditNote = await tripletexFetch<TripletexValueResponse<Invoice>>(
    `invoice/${originalInvoice.id}/:createCreditNote?date=${RUN_DATE}&sendToCustomer=false`,
    { method: "PUT" },
  );

  const created = creditNote.value;
  const creditedInvoiceId =
    typeof created?.creditedInvoice === "number"
      ? created.creditedInvoice
      : created?.creditedInvoice?.id;

  if (!created?.id || created.isCreditNote !== true || creditedInvoiceId !== originalInvoice.id) {
    throw new Error(`Unexpected credit note response: ${JSON.stringify(created)}`);
  }

  console.log(
    JSON.stringify({
      originalInvoiceId: originalInvoice.id,
      originalInvoiceNumber: originalInvoice.invoiceNumber,
      creditNoteId: created.id,
      creditNoteNumber: created.invoiceNumber,
      creditedInvoiceId,
      isCreditNote: created.isCreditNote,
    }),
  );
}

await main();
