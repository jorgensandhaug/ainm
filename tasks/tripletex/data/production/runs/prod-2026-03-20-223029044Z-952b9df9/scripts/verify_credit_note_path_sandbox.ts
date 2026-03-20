const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const FIXTURE = {
  customerName: "Montagne SARL Reflection 223029",
  email: "reflection-223029@montagne.example.com",
  organizationNumber: "990223029",
  description: "Heures de conseil",
  amountExcludingVatCurrency: 40900,
  invoiceDate: "2026-03-20",
  invoiceDueDate: "2026-04-03",
  searchDateTo: "2026-03-21",
};

type Wrapper<T> = {
  value?: T;
  values?: T[];
  error?: string;
  message?: string;
  source?: string;
};

type Customer = {
  id: number;
  name?: string;
  organizationNumber?: string | number | null;
};

type VatType = {
  id: number;
  percentage?: number | null;
};

type Invoice = {
  id: number;
  invoiceNumber?: string | number;
  amountExcludingVatCurrency?: number;
  amountExcludingVat?: number;
  isCreditNote?: boolean;
  isCredited?: boolean;
  creditedInvoice?: number | { id?: number } | null;
  customer?: { organizationNumber?: string | number | null } | null;
  orderLines?: Array<{ description?: string | null }> | null;
  orders?: Array<{
    orderLines?: Array<{ description?: string | null }> | null;
  }> | null;
};

function endpoint(path: string): URL {
  return new URL(path, BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`);
}

function headers(extra?: HeadersInit): HeadersInit {
  return {
    Authorization: `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`,
    Accept: "application/json",
    ...extra,
  };
}

async function api<T>(url: URL, init?: RequestInit): Promise<Wrapper<T>> {
  const response = await fetch(url, {
    ...init,
    headers: headers(init?.headers),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

function invoiceMatches(invoice: Invoice): boolean {
  if (invoice.isCreditNote || invoice.isCredited) return false;
  if (String(invoice.customer?.organizationNumber ?? "") !== FIXTURE.organizationNumber) return false;
  const amount = invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat;
  if (amount !== FIXTURE.amountExcludingVatCurrency) return false;

  const descriptions = new Set<string>();
  for (const line of invoice.orderLines ?? []) {
    if (line?.description) descriptions.add(line.description);
  }
  for (const order of invoice.orders ?? []) {
    for (const line of order.orderLines ?? []) {
      if (line?.description) descriptions.add(line.description);
    }
  }
  return descriptions.has(FIXTURE.description);
}

async function main() {
  const createdCustomer = await api<Customer>(endpoint("customer"), {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      name: FIXTURE.customerName,
      email: FIXTURE.email,
      organizationNumber: FIXTURE.organizationNumber,
    }),
  });

  const vatUrl = endpoint("ledger/vatType");
  vatUrl.searchParams.set("typeOfVat", "OUTGOING");
  vatUrl.searchParams.set("vatDate", FIXTURE.invoiceDate);
  vatUrl.searchParams.set("fields", "*");
  const vatTypes = await api<VatType>(vatUrl);
  const zeroVat = (vatTypes.values ?? []).find((row) => row.percentage === 0);
  if (!zeroVat) {
    throw new Error("No outgoing 0% VAT row found in sandbox");
  }

  const createdInvoice = await api<Invoice>(new URL(`${endpoint("invoice").toString()}?sendToCustomer=false`), {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      invoiceDate: FIXTURE.invoiceDate,
      invoiceDueDate: FIXTURE.invoiceDueDate,
      customer: { id: createdCustomer.value?.id },
      orders: [
        {
          customer: { id: createdCustomer.value?.id },
          orderDate: FIXTURE.invoiceDate,
          deliveryDate: FIXTURE.invoiceDate,
          orderLines: [
            {
              description: FIXTURE.description,
              count: 1,
              unitPriceExcludingVatCurrency: FIXTURE.amountExcludingVatCurrency,
              vatType: { id: zeroVat.id },
            },
          ],
        },
      ],
    }),
  });

  const searchUrl = endpoint("invoice");
  searchUrl.searchParams.set("invoiceDateFrom", "2000-01-01");
  searchUrl.searchParams.set("invoiceDateTo", FIXTURE.searchDateTo);
  searchUrl.searchParams.set("count", "1000");
  searchUrl.searchParams.set("sorting", "-invoiceDate");
  searchUrl.searchParams.set("fields", "*,customer(*),orderLines(*),orders(*,orderLines(*))");
  const searched = await api<Invoice>(searchUrl);

  const matches = (searched.values ?? []).filter(invoiceMatches);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly 1 sandbox proof invoice, got ${matches.length}`);
  }
  const original = matches[0];

  const topLevelHit = (original.orderLines ?? []).some((line) => line?.description === FIXTURE.description);
  const nestedHit = (original.orders ?? []).some((order) =>
    (order.orderLines ?? []).some((line) => line?.description === FIXTURE.description),
  );

  const creditUrl = endpoint(`invoice/${original.id}/:createCreditNote`);
  creditUrl.searchParams.set("date", FIXTURE.invoiceDate);
  creditUrl.searchParams.set("sendToCustomer", "false");
  const credited = await api<Invoice>(creditUrl, { method: "PUT" });

  const creditedInvoiceId =
    typeof credited.value?.creditedInvoice === "object" && credited.value?.creditedInvoice !== null
      ? credited.value.creditedInvoice.id
      : credited.value?.creditedInvoice;

  if (!credited.value?.isCreditNote || creditedInvoiceId !== original.id) {
    throw new Error("Sandbox credit-note proof failed");
  }

  console.log(
    JSON.stringify({
      ok: true,
      setupCalls: 3,
      proofCalls: 2,
      fixtureCustomerId: createdCustomer.value?.id ?? null,
      fixtureInvoiceIdFromCreate: createdInvoice.value?.id ?? null,
      matchedInvoiceId: original.id,
      matchedInvoiceNumber: original.invoiceNumber ?? null,
      duplicateDescriptionAcrossTopLevelAndNested: topLevelHit && nestedHit,
      creditNoteId: credited.value?.id ?? null,
      creditNoteNumber: credited.value?.invoiceNumber ?? null,
      vatPercentageUsedForFixture: zeroVat.percentage ?? null,
    }),
  );
}

await main();
