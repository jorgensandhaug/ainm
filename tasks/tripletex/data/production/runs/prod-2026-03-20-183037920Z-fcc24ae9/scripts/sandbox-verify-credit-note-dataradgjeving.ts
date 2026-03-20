const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const TODAY = "2026-03-20";
const DESCRIPTION = "Datarådgjeving";
const AMOUNT_EX_VAT = 45300;

const AUTH = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type Wrapper<T> = { value?: T; values?: T[]; fullResultSize?: number };

type Invoice = {
  id: number;
  invoiceNumber?: number | string;
  isCreditNote?: boolean;
  isCredited?: boolean;
  amountExcludingVat?: number;
  amountExcludingVatCurrency?: number;
  customer?: { organizationNumber?: string | number };
  orderLines?: Array<{ description?: string }>;
  orders?: Array<{ orderLines?: Array<{ description?: string }> }>;
  creditedInvoice?: number | { id?: number };
};

async function tripletex<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: AUTH,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      `${init?.method ?? "GET"} ${path} -> HTTP ${response.status} ${response.statusText}\n${JSON.stringify(
        data,
        null,
        2,
      )}`,
    );
  }

  return data as T;
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function uniqSuffix(): string {
  return String(Date.now()).slice(-8);
}

function creditedInvoiceId(invoice: Invoice | undefined): number | undefined {
  if (!invoice) {
    return undefined;
  }

  return typeof invoice.creditedInvoice === "object"
    ? invoice.creditedInvoice?.id
    : invoice.creditedInvoice;
}

async function main(): Promise<void> {
  const suffix = uniqSuffix();
  const orgNo = `81${suffix.padStart(7, "0").slice(0, 7)}`;
  const email = `credit-note-${suffix}@example.com`;

  const createdCustomer = await tripletex<
    Wrapper<{ id: number; organizationNumber?: string; name?: string }>
  >("/customer", {
    method: "POST",
    body: JSON.stringify({
      name: `Reflection Fixture ${suffix}`,
      organizationNumber: orgNo,
      email,
    }),
  });

  const customerId = createdCustomer.value?.id;
  if (!customerId) {
    throw new Error(`Customer create missing id: ${JSON.stringify(createdCustomer)}`);
  }

  const createdInvoice = await tripletex<
    Wrapper<{ id: number; invoiceNumber?: number | string }>
  >("/invoice?sendToCustomer=false", {
    method: "POST",
    body: JSON.stringify({
      invoiceDate: TODAY,
      invoiceDueDate: addDays(TODAY, 14),
      customer: { id: customerId },
      orders: [
        {
          customer: { id: customerId },
          orderDate: TODAY,
          deliveryDate: TODAY,
          orderLines: [
            {
              description: DESCRIPTION,
              count: 1,
              unitPriceExcludingVatCurrency: AMOUNT_EX_VAT,
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

  const located = await tripletex<Wrapper<Invoice>>(`/invoice?${query.toString()}`);

  const matches = (located.values ?? []).filter((invoice) => {
    const descriptions = [
      ...(invoice.orderLines ?? []).map((line) => line.description ?? ""),
      ...(invoice.orders ?? []).flatMap((order) =>
        (order.orderLines ?? []).map((line) => line.description ?? ""),
      ),
    ];

    return (
      invoice.isCreditNote !== true &&
      invoice.isCredited !== true &&
      String(invoice.customer?.organizationNumber ?? "") === orgNo &&
      (invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat) === AMOUNT_EX_VAT &&
      descriptions.includes(DESCRIPTION)
    );
  });

  if (matches.length !== 1) {
    throw new Error(`Expected 1 located invoice, got ${matches.length}: ${JSON.stringify(matches)}`);
  }

  const locatedInvoice = matches[0];

  const duplicateDescriptionHits =
    [
      ...(locatedInvoice.orderLines ?? []).map((line) => line.description ?? ""),
      ...(locatedInvoice.orders ?? []).flatMap((order) =>
        (order.orderLines ?? []).map((line) => line.description ?? ""),
      ),
    ].filter((description) => description === DESCRIPTION).length;

  const createdCreditNote = await tripletex<Wrapper<Invoice>>(
    `/invoice/${locatedInvoice.id}/:createCreditNote?date=${TODAY}&sendToCustomer=false`,
    { method: "PUT" },
  );

  const creditNote = createdCreditNote.value;
  const creditedId = creditedInvoiceId(creditNote);

  if (creditNote?.isCreditNote !== true || creditedId !== originalInvoiceId) {
    throw new Error(`Credit note verification failed: ${JSON.stringify(createdCreditNote)}`);
  }

  console.log(
    JSON.stringify(
      {
        fixture: {
          customerId,
          organizationNumber: orgNo,
          originalInvoiceId,
          originalInvoiceNumber: createdInvoice.value?.invoiceNumber,
        },
        locateProof: {
          matchedInvoiceId: locatedInvoice.id,
          matchedInvoiceNumber: locatedInvoice.invoiceNumber,
          duplicateDescriptionHits,
        },
        creditNoteProof: {
          creditNoteId: creditNote.id,
          creditNoteNumber: creditNote.invoiceNumber,
          creditedInvoice: creditedId,
        },
        minimalCoreAfterFixtureSetup: [
          `GET /invoice?${query.toString()}`,
          `PUT /invoice/${locatedInvoice.id}/:createCreditNote?date=${TODAY}&sendToCustomer=false`,
        ],
      },
      null,
      2,
    ),
  );
}

await main();
