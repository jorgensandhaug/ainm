const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "5Ialaj90HQn4n51t4y1ZFB-wwWB1Av0joJlX00FTqvE";
const RUN_DATE = "2026-03-20";
const CUSTOMER_ORG_NO = "812449982";
const TARGET_DESCRIPTION = "Datarådgjeving";
const TARGET_AMOUNT_EX_VAT = 45300;

const AUTH = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
const HEADERS = {
  Authorization: AUTH,
  Accept: "application/json",
  "Content-Type": "application/json",
};

type TripletexList<T> = {
  values?: T[];
  fullResultSize?: number;
};

type TripletexWrapper<T> = {
  value?: T;
};

type OrderLine = {
  description?: string;
  amountExcludingVatCurrency?: number;
  amountExcludingVat?: number;
  unitPriceExcludingVatCurrency?: number;
  count?: number;
};

type Invoice = {
  id: number;
  invoiceNumber?: number | string;
  invoiceDate?: string;
  isCreditNote?: boolean;
  isCredited?: boolean;
  amountExcludingVat?: number;
  amountExcludingVatCurrency?: number;
  customer?: {
    organizationNumber?: string | number;
    name?: string;
  };
  orderLines?: OrderLine[];
  orders?: Array<{
    orderLines?: OrderLine[];
  }>;
  creditedInvoice?: number | { id?: number };
};

function approxEqual(left: unknown, right: number): boolean {
  return typeof left === "number" && Math.abs(left - right) < 0.0001;
}

function normalized(text: string | undefined): string {
  return (text ?? "").trim();
}

function invoiceLines(invoice: Invoice): OrderLine[] {
  return [
    ...(invoice.orderLines ?? []),
    ...(invoice.orders ?? []).flatMap((order) => order.orderLines ?? []),
  ];
}

function invoiceMatchesAmount(invoice: Invoice): boolean {
  if (
    approxEqual(invoice.amountExcludingVatCurrency, TARGET_AMOUNT_EX_VAT) ||
    approxEqual(invoice.amountExcludingVat, TARGET_AMOUNT_EX_VAT)
  ) {
    return true;
  }

  return invoiceLines(invoice).some((line) => {
    if (
      approxEqual(line.amountExcludingVatCurrency, TARGET_AMOUNT_EX_VAT) ||
      approxEqual(line.amountExcludingVat, TARGET_AMOUNT_EX_VAT) ||
      approxEqual(line.unitPriceExcludingVatCurrency, TARGET_AMOUNT_EX_VAT)
    ) {
      return true;
    }

    if (
      typeof line.unitPriceExcludingVatCurrency === "number" &&
      typeof line.count === "number" &&
      approxEqual(line.unitPriceExcludingVatCurrency * line.count, TARGET_AMOUNT_EX_VAT)
    ) {
      return true;
    }

    return false;
  });
}

function exactDescriptionMatch(invoice: Invoice): boolean {
  return invoiceLines(invoice).some(
    (line) => normalized(line.description) === TARGET_DESCRIPTION,
  );
}

function containsDescriptionMatch(invoice: Invoice): boolean {
  return invoiceLines(invoice).some((line) =>
    normalized(line.description).includes(TARGET_DESCRIPTION),
  );
}

async function tripletex<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...HEADERS,
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

function creditedInvoiceId(value: Invoice | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  return typeof value.creditedInvoice === "object"
    ? value.creditedInvoice?.id
    : value.creditedInvoice;
}

function dedupeInvoices(invoices: Invoice[]): Invoice[] {
  const seen = new Set<number>();
  const result: Invoice[] = [];

  for (const invoice of invoices) {
    if (!seen.has(invoice.id)) {
      seen.add(invoice.id);
      result.push(invoice);
    }
  }

  return result;
}

async function main(): Promise<void> {
  const locateQuery = new URLSearchParams({
    invoiceDateFrom: "2000-01-01",
    invoiceDateTo: "2026-03-21",
    count: "1000",
    sorting: "-invoiceDate",
    fields: "*,customer(*),orderLines(*),orders(*,orderLines(*))",
  });

  const locateResponse = await tripletex<TripletexList<Invoice>>(
    `/invoice?${locateQuery.toString()}`,
  );

  const baseCandidates = dedupeInvoices(
    (locateResponse.values ?? []).filter(
      (invoice) =>
        invoice.isCreditNote !== true &&
        invoice.isCredited !== true &&
        String(invoice.customer?.organizationNumber ?? "") === CUSTOMER_ORG_NO &&
        invoiceMatchesAmount(invoice),
    ),
  );

  const exactMatches = baseCandidates.filter(exactDescriptionMatch);
  const containsMatches = baseCandidates.filter(containsDescriptionMatch);

  const chosenMatches =
    exactMatches.length === 1
      ? exactMatches
      : containsMatches.length === 1
        ? containsMatches
        : exactMatches.length > 0
          ? exactMatches
          : containsMatches;

  if (chosenMatches.length !== 1) {
    throw new Error(
      `Expected 1 invoice match, got ${chosenMatches.length}\n${JSON.stringify(
        {
          baseCandidates: baseCandidates.map((invoice) => ({
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            invoiceDate: invoice.invoiceDate,
            customerOrgNo: invoice.customer?.organizationNumber,
            amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
            amountExcludingVat: invoice.amountExcludingVat,
            descriptions: invoiceLines(invoice).map((line) => line.description ?? ""),
          })),
        },
        null,
        2,
      )}`,
    );
  }

  const originalInvoice = chosenMatches[0];

  const creditNoteResponse = await tripletex<TripletexWrapper<Invoice>>(
    `/invoice/${originalInvoice.id}/:createCreditNote?date=${encodeURIComponent(
      RUN_DATE,
    )}&sendToCustomer=false`,
    { method: "PUT" },
  );

  const creditNote = creditNoteResponse.value;
  const originalCreditedId = creditedInvoiceId(creditNote);

  if (creditNote?.isCreditNote !== true || originalCreditedId !== originalInvoice.id) {
    throw new Error(
      `Credit note verification failed\n${JSON.stringify(
        {
          originalInvoiceId: originalInvoice.id,
          creditNote,
        },
        null,
        2,
      )}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        originalInvoiceId: originalInvoice.id,
        originalInvoiceNumber: originalInvoice.invoiceNumber,
        creditNoteId: creditNote.id,
        creditNoteNumber: creditNote.invoiceNumber,
        creditedInvoice: originalCreditedId,
      },
      null,
      2,
    ),
  );
}

await main();
