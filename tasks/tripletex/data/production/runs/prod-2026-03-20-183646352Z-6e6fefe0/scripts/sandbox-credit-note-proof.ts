const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const RUN_DATE = "2026-03-20";
const SEARCH_FROM = "2000-01-01";
const SEARCH_TO = "2026-03-21";
const DUE_DATE = "2026-04-03";
const TARGET = {
  name: "Cascade SARL",
  organizationNumber: "973999966",
  email: "cascade.sarl@example.com",
  description: "Conseil en données",
  amountExcludingVatCurrency: 40800,
};

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type TripletexListResponse<T> = {
  values?: T[];
};

type TripletexValueResponse<T> = {
  value?: T;
};

type Customer = {
  id?: number;
  name?: string;
  organizationNumber?: string | null;
};

type VatType = {
  id?: number;
  percentage?: number | null;
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
    id?: number;
    name?: string;
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

async function tripletexFetch<T>(pathWithQuery: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}/${pathWithQuery}`, {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${pathWithQuery}: ${body}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function getDescriptions(invoice: Invoice): string[] {
  return [
    ...(invoice.orderLines ?? []).flatMap((line) => (line?.description ? [line.description] : [])),
    ...(invoice.orders ?? []).flatMap((order) =>
      (order.orderLines ?? []).flatMap((line) => (line?.description ? [line.description] : [])),
    ),
  ];
}

function getAmountExVat(invoice: Invoice): number | null {
  if (typeof invoice.amountExcludingVatCurrency === "number") return invoice.amountExcludingVatCurrency;
  if (typeof invoice.amountExcludingVat === "number") return invoice.amountExcludingVat;
  return null;
}

function isTargetInvoice(invoice: Invoice): boolean {
  return (
    Boolean(invoice.id) &&
    invoice.isCreditNote !== true &&
    invoice.isCredited !== true &&
    invoice.customer?.organizationNumber === TARGET.organizationNumber &&
    getAmountExVat(invoice) === TARGET.amountExcludingVatCurrency &&
    getDescriptions(invoice).includes(TARGET.description)
  );
}

async function searchInvoices(): Promise<Invoice[]> {
  const query = new URLSearchParams({
    invoiceDateFrom: SEARCH_FROM,
    invoiceDateTo: SEARCH_TO,
    count: "1000",
    sorting: "-invoiceDate",
    fields: "*,customer(*),orderLines(*),orders(*,orderLines(*))",
  });
  const response = await tripletexFetch<TripletexListResponse<Invoice>>(`invoice?${query.toString()}`);
  return (response.values ?? []).filter(isTargetInvoice);
}

async function ensureCustomer(): Promise<Customer> {
  const query = new URLSearchParams({
    organizationNumber: TARGET.organizationNumber,
    count: "10",
    fields: "*",
  });
  const response = await tripletexFetch<TripletexListResponse<Customer>>(`customer?${query.toString()}`);
  const matches = (response.values ?? []).filter(
    (customer) => customer.organizationNumber === TARGET.organizationNumber,
  );

  if (matches.length === 1 && matches[0].id) {
    return matches[0];
  }

  if (matches.length > 1) {
    const exactName = matches.find((customer) => customer.name === TARGET.name && customer.id);
    if (exactName?.id) {
      return exactName;
    }
    throw new Error(`Ambiguous sandbox customers for ${TARGET.organizationNumber}: ${JSON.stringify(matches)}`);
  }

  const created = await tripletexFetch<TripletexValueResponse<Customer>>("customer", {
    method: "POST",
    body: JSON.stringify({
      name: TARGET.name,
      email: TARGET.email,
      organizationNumber: TARGET.organizationNumber,
    }),
  });

  if (!created.value?.id) {
    throw new Error(`Customer create response missing id: ${JSON.stringify(created.value)}`);
  }

  return created.value;
}

async function resolveOutgoingZeroVatId(): Promise<number> {
  const query = new URLSearchParams({
    typeOfVat: "OUTGOING",
    vatDate: RUN_DATE,
    fields: "*",
  });
  const response = await tripletexFetch<TripletexListResponse<VatType>>(`ledger/vatType?${query.toString()}`);
  const vat = (response.values ?? []).find((entry) => entry.percentage === 0 && entry.id);
  if (!vat?.id) {
    throw new Error(`No outgoing 0% VAT type available: ${JSON.stringify(response.values ?? [])}`);
  }
  return vat.id;
}

async function createFixtureInvoice(customerId: number, vatTypeId: number): Promise<Invoice> {
  const created = await tripletexFetch<TripletexValueResponse<Invoice>>("invoice?sendToCustomer=false", {
    method: "POST",
    body: JSON.stringify({
      invoiceDate: RUN_DATE,
      invoiceDueDate: DUE_DATE,
      customer: { id: customerId },
      orders: [
        {
          customer: { id: customerId },
          orderDate: RUN_DATE,
          deliveryDate: RUN_DATE,
          orderLines: [
            {
              description: TARGET.description,
              count: 1,
              unitPriceExcludingVatCurrency: TARGET.amountExcludingVatCurrency,
              vatType: { id: vatTypeId },
            },
          ],
        },
      ],
    }),
  });

  if (!created.value?.id) {
    throw new Error(`Invoice create response missing id: ${JSON.stringify(created.value)}`);
  }

  return created.value;
}

async function main() {
  let setupCreatedCustomer = false;
  let setupCreatedInvoice = false;

  let targetInvoices = await searchInvoices();
  if (targetInvoices.length > 1) {
    throw new Error(
      `Sandbox already has ambiguous target invoices before setup: ${JSON.stringify(
        targetInvoices.map((invoice) => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          descriptions: getDescriptions(invoice),
        })),
      )}`,
    );
  }

  if (targetInvoices.length === 0) {
    const customerQuery = new URLSearchParams({
      organizationNumber: TARGET.organizationNumber,
      count: "10",
      fields: "*",
    });
    const existingCustomers = await tripletexFetch<TripletexListResponse<Customer>>(
      `customer?${customerQuery.toString()}`,
    );
    const customerMatches = (existingCustomers.values ?? []).filter(
      (customer) => customer.organizationNumber === TARGET.organizationNumber,
    );
    if (customerMatches.length === 0) {
      setupCreatedCustomer = true;
    }

    const customer = await ensureCustomer();
    const zeroVatId = await resolveOutgoingZeroVatId();
    const createdInvoice = await createFixtureInvoice(customer.id!, zeroVatId);
    setupCreatedInvoice = true;

    targetInvoices = await searchInvoices();
    if (targetInvoices.length !== 1 || targetInvoices[0].id !== createdInvoice.id) {
      throw new Error(
        `Expected one exact target invoice after setup, got ${JSON.stringify(
          targetInvoices.map((invoice) => ({
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            descriptions: getDescriptions(invoice),
          })),
        )}`,
      );
    }
  }

  const proofLocateMatches = await searchInvoices();
  if (proofLocateMatches.length !== 1 || !proofLocateMatches[0].id) {
    throw new Error(
      `Proof locate step not unique: ${JSON.stringify(
        proofLocateMatches.map((invoice) => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          descriptions: getDescriptions(invoice),
        })),
      )}`,
    );
  }

  const original = proofLocateMatches[0];
  const creditNote = await tripletexFetch<TripletexValueResponse<Invoice>>(
    `invoice/${original.id}/:createCreditNote?date=${RUN_DATE}&sendToCustomer=false`,
    { method: "PUT" },
  );

  const createdCredit = creditNote.value;
  const creditedInvoiceId =
    typeof createdCredit?.creditedInvoice === "number"
      ? createdCredit.creditedInvoice
      : createdCredit?.creditedInvoice?.id;

  if (!createdCredit?.id || createdCredit.isCreditNote !== true || creditedInvoiceId !== original.id) {
    throw new Error(`Unexpected credit-note response: ${JSON.stringify(createdCredit)}`);
  }

  console.log(
    JSON.stringify({
      setupCreatedCustomer,
      setupCreatedInvoice,
      proofPath: [
        `GET /invoice?invoiceDateFrom=${SEARCH_FROM}&invoiceDateTo=${SEARCH_TO}&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`,
        `PUT /invoice/${original.id}/:createCreditNote?date=${RUN_DATE}&sendToCustomer=false`,
      ],
      originalInvoiceId: original.id,
      originalInvoiceNumber: original.invoiceNumber,
      originalDescriptions: getDescriptions(original),
      creditNoteId: createdCredit.id,
      creditNoteNumber: createdCredit.invoiceNumber,
      creditedInvoiceId,
      isCreditNote: createdCredit.isCreditNote,
    }),
  );
}

await main();
