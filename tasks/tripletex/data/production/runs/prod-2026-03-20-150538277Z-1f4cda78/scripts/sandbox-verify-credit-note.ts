const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = Buffer.from(`0:${sessionToken}`).toString("base64");
const baseHeaders = {
  Authorization: `Basic ${auth}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

type Wrapper<T> = { value?: T; values?: T[] };

async function tripletex<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...baseHeaders,
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

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function uniqSuffix(): string {
  return String(Date.now()).slice(-8);
}

async function main() {
  const today = "2026-03-20";
  const marker = `Reflection Credit ${uniqSuffix()}`;
  const orgNo = `81${uniqSuffix().padStart(7, "0").slice(0, 7)}`;
  const email = `reflection-${uniqSuffix()}@example.com`;

  const createdCustomer = await tripletex<
    Wrapper<{
      id: number;
      name: string;
      organizationNumber: string;
    }>
  >("/customer", {
    method: "POST",
    body: JSON.stringify({
      name: `Reflection Fixture ${marker}`,
      email,
      organizationNumber: orgNo,
    }),
  });

  const customerId = createdCustomer.value?.id;
  if (!customerId) {
    throw new Error(`Customer create missing id: ${JSON.stringify(createdCustomer)}`);
  }

  const createdInvoice = await tripletex<
    Wrapper<{
      id: number;
      invoiceNumber?: number | string;
      amountExcludingVat?: number;
      amountExcludingVatCurrency?: number;
    }>
  >("/invoice?sendToCustomer=false", {
    method: "POST",
    body: JSON.stringify({
      invoiceDate: today,
      invoiceDueDate: addDays(today, 14),
      customer: { id: customerId },
      orders: [
        {
          customer: { id: customerId },
          orderDate: today,
          deliveryDate: today,
          orderLines: [
            {
              description: marker,
              count: 1,
              unitPriceExcludingVatCurrency: 10400,
            },
          ],
        },
      ],
    }),
  });

  const originalInvoiceId = createdInvoice.value?.id;
  if (!originalInvoiceId) {
    throw new Error(`Invoice create missing id: ${JSON.stringify(createdInvoice)}`);
  }

  const query = new URLSearchParams({
    invoiceDateFrom: "2026-01-01",
    invoiceDateTo: "2027-01-01",
    count: "1000",
    sorting: "-invoiceDate",
    fields: "*,customer(*),orderLines(*),orders(*,orderLines(*))",
  });

  const located = await tripletex<
    Wrapper<{
      id: number;
      invoiceNumber?: number | string;
      isCreditNote?: boolean;
      isCredited?: boolean;
      amountExcludingVat?: number;
      amountExcludingVatCurrency?: number;
      customer?: { organizationNumber?: string | number };
      orderLines?: Array<{ description?: string }>;
      orders?: Array<{ orderLines?: Array<{ description?: string }> }>;
    }>
  >(`/invoice?${query.toString()}`);

  const matches = (located.values ?? []).filter((invoice) => {
    const descriptions = [
      ...(invoice.orderLines ?? []).map((line) => line.description ?? ""),
      ...(invoice.orders ?? []).flatMap((order) =>
        (order.orderLines ?? []).map((line) => line.description ?? "")
      ),
    ];

    return (
      invoice.isCreditNote !== true &&
      invoice.isCredited !== true &&
      String(invoice.customer?.organizationNumber ?? "") === orgNo &&
      (invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat) === 10400 &&
      descriptions.includes(marker)
    );
  });

  if (matches.length !== 1) {
    throw new Error(
      `Expected 1 located invoice, got ${matches.length}: ${JSON.stringify(matches)}`
    );
  }

  const locatedInvoice = matches[0];
  if (locatedInvoice.id !== originalInvoiceId) {
    throw new Error(
      `Locate step found wrong invoice ${locatedInvoice.id}, expected ${originalInvoiceId}`
    );
  }

  const creditNote = await tripletex<
    Wrapper<{
      id: number;
      invoiceNumber?: number | string;
      isCreditNote?: boolean;
      creditedInvoice?: number | { id?: number };
    }>
  >(
    `/invoice/${locatedInvoice.id}/:createCreditNote?date=${today}&sendToCustomer=false`,
    { method: "PUT" }
  );

  const creditedInvoiceId =
    typeof creditNote.value?.creditedInvoice === "object"
      ? creditNote.value?.creditedInvoice?.id
      : creditNote.value?.creditedInvoice;

  if (creditNote.value?.isCreditNote !== true || creditedInvoiceId !== originalInvoiceId) {
    throw new Error(`Credit note verify failed: ${JSON.stringify(creditNote)}`);
  }

  console.log(
    JSON.stringify(
      {
        fixture: {
          customerId,
          organizationNumber: orgNo,
          marker,
          originalInvoiceId,
          originalInvoiceNumber: createdInvoice.value?.invoiceNumber,
        },
        locateProof: {
          matchedInvoiceId: locatedInvoice.id,
          matchedInvoiceNumber: locatedInvoice.invoiceNumber,
        },
        creditNoteProof: {
          creditNoteId: creditNote.value?.id,
          creditNoteNumber: creditNote.value?.invoiceNumber,
          creditedInvoiceId,
        },
      },
      null,
      2
    )
  );
}

await main();
