const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "HUXiera948R27-No4kKm96n5AT_iypH_Iw3PGQKvfS8";

const auth = Buffer.from(`0:${sessionToken}`).toString("base64");
const headers = {
  Authorization: `Basic ${auth}`,
  Accept: "application/json",
};

const target = {
  organizationNumber: "809303829",
  description: "Systementwicklung",
  amountExVat: 10400,
  creditDate: "2026-03-20",
};

type Invoice = {
  id: number;
  invoiceNumber?: number | string;
  amountExcludingVat?: number;
  amountExcludingVatCurrency?: number;
  isCreditNote?: boolean;
  isCredited?: boolean;
  customer?: { organizationNumber?: string | number };
  orderLines?: Array<{ description?: string }>;
  orders?: Array<{ orderLines?: Array<{ description?: string }> }>;
};

async function tripletex<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText}\n${JSON.stringify(data)}`
    );
  }

  return data as T;
}

function getDescriptions(invoice: Invoice): string[] {
  return [
    ...(invoice.orderLines ?? []).map((line) => line.description ?? ""),
    ...(invoice.orders ?? []).flatMap((order) =>
      (order.orderLines ?? []).map((line) => line.description ?? "")
    ),
  ].filter(Boolean);
}

function matches(invoice: Invoice): boolean {
  const orgNo = String(invoice.customer?.organizationNumber ?? "");
  const amount = invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat;
  const descriptions = getDescriptions(invoice);

  return (
    invoice.isCreditNote !== true &&
    invoice.isCredited !== true &&
    orgNo === target.organizationNumber &&
    amount === target.amountExVat &&
    descriptions.includes(target.description)
  );
}

async function main() {
  const from = "2000-01-01";
  const to = "2026-03-21";
  const fields =
    "*,customer(*),orderLines(*),orders(*,orderLines(*))";
  const query = new URLSearchParams({
    invoiceDateFrom: from,
    invoiceDateTo: to,
    count: "1000",
    sorting: "-invoiceDate",
    fields,
  });

  const invoiceList = await tripletex<{ values?: Invoice[] }>(
    `/invoice?${query.toString()}`
  );
  const matchesFound = (invoiceList.values ?? []).filter(matches);

  if (matchesFound.length !== 1) {
    throw new Error(
      `Expected exactly 1 matching invoice, found ${matchesFound.length}`
    );
  }

  const original = matchesFound[0];
  const creditNote = await tripletex<{
    value?: {
      id?: number;
      invoiceNumber?: number | string;
      isCreditNote?: boolean;
      creditedInvoice?: number | { id?: number };
    };
  }>(
    `/invoice/${original.id}/:createCreditNote?date=${target.creditDate}&sendToCustomer=false`,
    { method: "PUT" }
  );

  const created = creditNote.value;
  const creditedInvoiceId =
    typeof created?.creditedInvoice === "object"
      ? created?.creditedInvoice?.id
      : created?.creditedInvoice;

  if (created?.isCreditNote !== true || creditedInvoiceId !== original.id) {
    throw new Error(`Credit note verification failed: ${JSON.stringify(created)}`);
  }

  console.log(
    JSON.stringify(
      {
        originalInvoiceId: original.id,
        originalInvoiceNumber: original.invoiceNumber,
        creditNoteId: created.id,
        creditNoteNumber: created.invoiceNumber,
        creditedInvoiceId,
      },
      null,
      2
    )
  );
}

await main();
