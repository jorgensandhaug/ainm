const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

const today = "2026-03-20";
const dueDate = "2026-04-03";
const deliveryDate = "2026-03-20";
const targetDescription = "Maintenance";
const targetAmount = 30500;
const orgNo = "900993560";
const fixtureEmail = "creditnote-proof-20260320@example.com";
const fixtureName = "Ridgepoint Ltd Credit Proof";

type VatType = {
  id: number;
  percentage?: number | null;
};

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
    organizationNumber?: string | null;
  } | null;
  orderLines?: InvoiceLine[] | null;
  orders?: Array<{
    orderLines?: InvoiceLine[] | null;
  }> | null;
};

async function tripletex<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
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

function invoiceDescriptions(invoice: Invoice): string[] {
  return [
    ...(invoice.orderLines ?? []).map((line) => line?.description ?? ""),
    ...(invoice.orders ?? []).flatMap((order) =>
      (order?.orderLines ?? []).map((line) => line?.description ?? ""),
    ),
  ];
}

function isTargetInvoice(invoice: Invoice): boolean {
  if (invoice.isCreditNote || invoice.isCredited) return false;
  if (invoice.customer?.organizationNumber !== orgNo) return false;
  const amount = invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat;
  if (amount !== targetAmount) return false;
  return invoiceDescriptions(invoice).some((description) => description === targetDescription);
}

const customer = await tripletex<{ value: { id: number } }>("/customer", {
  method: "POST",
  body: JSON.stringify({
    name: fixtureName,
    email: fixtureEmail,
    organizationNumber: orgNo,
  }),
});

const vatTypes = await tripletex<{ values?: VatType[] }>(
  `/ledger/vatType?${new URLSearchParams({
    typeOfVat: "OUTGOING",
    vatDate: today,
    fields: "*",
  }).toString()}`,
);

const zeroVat = (vatTypes.values ?? []).find((vatType) => vatType.percentage === 0);
if (!zeroVat) {
  console.error(JSON.stringify({ error: "Missing 0% outgoing VAT type", vatTypes }, null, 2));
  process.exit(1);
}

const createdInvoice = await tripletex<{ value: { id: number; invoiceNumber?: number | string } }>(
  `/invoice?sendToCustomer=false`,
  {
    method: "POST",
    body: JSON.stringify({
      invoiceDate: today,
      invoiceDueDate: dueDate,
      customer: { id: customer.value.id },
      orders: [
        {
          customer: { id: customer.value.id },
          orderDate: today,
          deliveryDate,
          orderLines: [
            {
              description: targetDescription,
              count: 1,
              unitPriceExcludingVatCurrency: targetAmount,
              vatType: { id: zeroVat.id },
            },
          ],
        },
      ],
    }),
  },
);

const locateParams = new URLSearchParams({
  invoiceDateFrom: "2000-01-01",
  invoiceDateTo: "2026-03-21",
  count: "1000",
  sorting: "-invoiceDate",
  fields: "*,customer(*),orderLines(*),orders(*,orderLines(*))",
});

const locatedInvoices = await tripletex<{ values?: Invoice[] }>(
  `/invoice?${locateParams.toString()}`,
);
const matches = (locatedInvoices.values ?? []).filter(isTargetInvoice);

const targetInvoice = matches.find((invoice) => invoice.id === createdInvoice.value.id);
if (!targetInvoice) {
  console.error(
    JSON.stringify(
      {
        error: "Two-call proof locate step did not recover the created invoice",
        createdInvoiceId: createdInvoice.value.id,
        matchCount: matches.length,
        matches: matches.map((invoice) => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          descriptions: invoiceDescriptions(invoice),
          customer: invoice.customer,
          amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
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

const creditNote = await tripletex<{
  value: {
    id: number;
    invoiceNumber?: number | string | null;
    creditedInvoice?: number | null;
    isCreditNote?: boolean | null;
    amountExcludingVatCurrency?: number | null;
    amountCurrency?: number | null;
  };
}>(`/invoice/${targetInvoice.id}/:createCreditNote?date=${today}&sendToCustomer=false`, {
  method: "PUT",
});

console.log(
  JSON.stringify(
    {
      setup: {
        customerId: customer.value.id,
        invoiceId: createdInvoice.value.id,
        invoiceNumber: createdInvoice.value.invoiceNumber ?? null,
        vatTypeId: zeroVat.id,
      },
      proofPath: {
        locateCall:
          "GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-21&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))",
        locateMatchedInvoiceId: targetInvoice.id,
        locateMatchedInvoiceNumber: targetInvoice.invoiceNumber ?? null,
        creditCall: `PUT /invoice/${targetInvoice.id}/:createCreditNote?date=${today}&sendToCustomer=false`,
      },
      creditNote: creditNote.value,
      proof: {
        writeResponseProvesSuccess:
          creditNote.value.isCreditNote === true &&
          creditNote.value.creditedInvoice === targetInvoice.id,
        duplicateDescriptionHitsSeen:
          invoiceDescriptions(targetInvoice).filter((description) => description === targetDescription)
            .length > 1,
      },
    },
    null,
    2,
  ),
);
