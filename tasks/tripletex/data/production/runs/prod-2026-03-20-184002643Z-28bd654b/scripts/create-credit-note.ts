const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "RBixRN3auXXZI9z4zEcNXJG1hK89TGw3EdU0hlkap4o";

const TARGET = {
  organizationNumber: "991882502",
  description: "Opplæring",
  amountExcludingVat: 13100,
  creditNoteDate: "2026-03-20",
  invoiceDateFrom: "2000-01-01",
  invoiceDateTo: "2026-03-21",
};

type TripletexListResponse<T> = {
  values?: T[];
  value?: T;
};

type InvoiceLine = {
  description?: string | null;
};

type InvoiceLike = {
  id?: number;
  invoiceNumber?: number | string | null;
  invoiceDate?: string | null;
  isCreditNote?: boolean | null;
  isCredited?: boolean | null;
  amountExcludingVatCurrency?: number | null;
  amountExcludingVat?: number | null;
  customer?: {
    id?: number | null;
    name?: string | null;
    organizationNumber?: string | null;
  } | null;
  orderLines?: InvoiceLine[] | null;
  orders?: Array<{
    orderLines?: InvoiceLine[] | null;
  }> | null;
  creditedInvoice?: number | { id?: number | null } | null;
};

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
const normalizedBaseUrl = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;

function buildUrl(path: string, query?: Record<string, string>): URL {
  const url = new URL(path, normalizedBaseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function tripletex<T>(path: string, init?: RequestInit, query?: Record<string, string>): Promise<T> {
  const response = await fetch(buildUrl(path, query), {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${response.status} ${body}`);
  }

  return (await response.json()) as T;
}

function getDescriptions(invoice: InvoiceLike): string[] {
  const descriptions = new Set<string>();
  for (const line of invoice.orderLines ?? []) {
    const description = line?.description?.trim();
    if (description) descriptions.add(description);
  }
  for (const order of invoice.orders ?? []) {
    for (const line of order?.orderLines ?? []) {
      const description = line?.description?.trim();
      if (description) descriptions.add(description);
    }
  }
  return [...descriptions];
}

function getAmountExVat(invoice: InvoiceLike): number | null {
  if (typeof invoice.amountExcludingVatCurrency === "number") return invoice.amountExcludingVatCurrency;
  if (typeof invoice.amountExcludingVat === "number") return invoice.amountExcludingVat;
  return null;
}

function getCreditedInvoiceId(invoice: InvoiceLike): number | null {
  if (typeof invoice.creditedInvoice === "number") return invoice.creditedInvoice;
  if (invoice.creditedInvoice && typeof invoice.creditedInvoice === "object" && typeof invoice.creditedInvoice.id === "number") {
    return invoice.creditedInvoice.id;
  }
  return null;
}

function summarize(invoice: InvoiceLike): Record<string, unknown> {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    customerOrganizationNumber: invoice.customer?.organizationNumber,
    amountExcludingVat: getAmountExVat(invoice),
    descriptions: getDescriptions(invoice),
    isCreditNote: invoice.isCreditNote,
    isCredited: invoice.isCredited,
  };
}

async function main() {
  const list = await tripletex<TripletexListResponse<InvoiceLike>>(
    "invoice",
    undefined,
    {
      invoiceDateFrom: TARGET.invoiceDateFrom,
      invoiceDateTo: TARGET.invoiceDateTo,
      count: "1000",
      sorting: "-invoiceDate",
      fields: "*,customer(*),orderLines(*),orders(*,orderLines(*))",
    },
  );

  const invoices = Array.isArray(list.values) ? list.values : [];
  const candidates = invoices.filter((invoice) => {
    if (invoice.isCreditNote === true || invoice.isCredited === true) return false;
    if (invoice.customer?.organizationNumber !== TARGET.organizationNumber) return false;
    if (getAmountExVat(invoice) !== TARGET.amountExcludingVat) return false;
    return getDescriptions(invoice).includes(TARGET.description);
  });

  const uniqueCandidates = [...new Map(candidates.map((invoice) => [invoice.id, invoice])).values()];

  if (uniqueCandidates.length !== 1 || typeof uniqueCandidates[0]?.id !== "number") {
    throw new Error(
      `Expected exactly one invoice candidate, got ${uniqueCandidates.length}: ${JSON.stringify(uniqueCandidates.map(summarize), null, 2)}`,
    );
  }

  const originalInvoice = uniqueCandidates[0];

  const creditNoteResponse = await tripletex<{ value?: InvoiceLike }>(
    `invoice/${originalInvoice.id}/:createCreditNote`,
    { method: "PUT" },
    {
      date: TARGET.creditNoteDate,
      sendToCustomer: "false",
    },
  );

  const creditNote = creditNoteResponse.value;
  if (!creditNote || creditNote.isCreditNote !== true || getCreditedInvoiceId(creditNote) !== originalInvoice.id) {
    throw new Error(`Unexpected credit note response: ${JSON.stringify(creditNoteResponse, null, 2)}`);
  }

  console.log(
    JSON.stringify(
      {
        originalInvoiceId: originalInvoice.id,
        originalInvoiceNumber: originalInvoice.invoiceNumber ?? null,
        creditNoteId: creditNote.id ?? null,
        creditNoteNumber: creditNote.invoiceNumber ?? null,
        creditedInvoiceId: getCreditedInvoiceId(creditNote),
        isCreditNote: creditNote.isCreditNote,
      },
      null,
      2,
    ),
  );
}

await main();
