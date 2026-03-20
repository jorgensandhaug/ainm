const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "ExxqRqKtLyQnTEU2-T3iSJHHjrZfVGaJzU0JgalPUSA";
const creditDate = "2026-03-20";
const targetOrgNo = "900993560";
const targetAmount = 30500;
const targetDescription = "Maintenance";

const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

type InvoiceLine = {
  description?: string | null;
};

type Invoice = {
  id: number;
  invoiceNumber?: number | string | null;
  invoiceDate?: string | null;
  amountExcludingVat?: number | null;
  amountExcludingVatCurrency?: number | null;
  isCreditNote?: boolean | null;
  isCredited?: boolean | null;
  customer?: {
    id?: number | null;
    name?: string | null;
    organizationNumber?: string | null;
  } | null;
  orderLines?: InvoiceLine[] | null;
  orders?: Array<{
    id?: number | null;
    orderLines?: InvoiceLine[] | null;
  }> | null;
};

function getDescriptions(invoice: Invoice): string[] {
  const topLevel = (invoice.orderLines ?? []).map((line) => line?.description ?? "");
  const nested = (invoice.orders ?? []).flatMap((order) =>
    (order?.orderLines ?? []).map((line) => line?.description ?? ""),
  );
  return [...topLevel, ...nested];
}

function matchesTarget(invoice: Invoice): boolean {
  if (invoice.isCreditNote || invoice.isCredited) return false;
  if (invoice.customer?.organizationNumber !== targetOrgNo) return false;
  const amount = invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat;
  if (amount !== targetAmount) return false;
  return getDescriptions(invoice).some((description) => description === targetDescription);
}

async function tripletex<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    console.error(JSON.stringify({ path, status: response.status, body }, null, 2));
    process.exit(1);
  }

  return body as T;
}

const searchParams = new URLSearchParams({
  invoiceDateFrom: "2000-01-01",
  invoiceDateTo: "2026-03-21",
  count: "1000",
  sorting: "-invoiceDate",
  fields: "*,customer(*),orderLines(*),orders(*,orderLines(*))",
});

const invoiceList = await tripletex<{ values?: Invoice[] }>(
  `/invoice?${searchParams.toString()}`,
);

const matches = (invoiceList.values ?? []).filter(matchesTarget);

if (matches.length !== 1) {
  console.error(
    JSON.stringify(
      {
        error: "Expected exactly one matching invoice",
        matchCount: matches.length,
        matches: matches.map((invoice) => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate,
          amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
          amountExcludingVat: invoice.amountExcludingVat,
          customer: invoice.customer,
          descriptions: getDescriptions(invoice),
          isCreditNote: invoice.isCreditNote,
          isCredited: invoice.isCredited,
        })),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const originalInvoice = matches[0];
const creditNote = await tripletex<{ value?: Record<string, unknown> }>(
  `/invoice/${originalInvoice.id}/:createCreditNote?date=${encodeURIComponent(creditDate)}&sendToCustomer=false`,
  { method: "PUT" },
);

console.log(
  JSON.stringify(
    {
      originalInvoiceId: originalInvoice.id,
      originalInvoiceNumber: originalInvoice.invoiceNumber,
      creditNote: creditNote.value,
    },
    null,
    2,
  ),
);
