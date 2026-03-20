const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const RUN_DATE = "2026-03-20";
const INVOICE_DATE_TO = "2026-03-21";
const DESCRIPTION = "Maintenance";
const AMOUNT_EX_VAT = 45550;

type Wrapper<T> = { value?: T; values?: T[] };

type VatType = {
  id: number;
  number?: string | number | null;
  percentage?: number | null;
  typeOfVat?: string | null;
};

type Customer = {
  id: number;
  name?: string | null;
  email?: string | null;
  organizationNumber?: string | number | null;
};

type LedgerAccount = {
  id: number;
  number?: string | number | null;
  isBankAccount?: boolean | null;
  isInvoiceAccount?: boolean | null;
};

type InvoiceLike = {
  id: number;
  invoiceNumber?: string | number | null;
  invoiceDate?: string | null;
  isCreditNote?: boolean | null;
  isCredited?: boolean | null;
  amountExcludingVat?: number | null;
  amountExcludingVatCurrency?: number | null;
  customer?: {
    id?: number | null;
    name?: string | null;
    organizationNumber?: string | number | null;
  } | null;
  creditedInvoice?: number | { id?: number | null } | null;
  orderLines?: Array<{ description?: string | null }> | null;
  orders?: Array<{
    orderLines?: Array<{ description?: string | null }> | null;
  }> | null;
};

function authHeader() {
  return `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(
      `HTTP ${response.status} ${response.statusText} for ${path}\n${JSON.stringify(data, null, 2)}`,
    );
    (error as Error & { responseBody?: unknown }).responseBody = data;
    throw error;
  }

  return data as T;
}

function getDescriptions(invoice: InvoiceLike): string[] {
  const direct = (invoice.orderLines ?? [])
    .map((line) => line.description?.trim())
    .filter((value): value is string => Boolean(value));

  const nested = (invoice.orders ?? []).flatMap((order) =>
    (order.orderLines ?? [])
      .map((line) => line.description?.trim())
      .filter((value): value is string => Boolean(value)),
  );

  return [...direct, ...nested];
}

function getCreditedInvoiceId(value: InvoiceLike["creditedInvoice"]): number | null {
  if (typeof value === "number") {
    return value;
  }
  if (value && typeof value === "object" && typeof value.id === "number") {
    return value.id;
  }
  return null;
}

function checksumDigit(baseDigits: string, weights: number[]): number | null {
  const sum = baseDigits
    .split("")
    .map((digit, index) => Number(digit) * weights[index])
    .reduce((acc, value) => acc + value, 0);
  const remainder = sum % 11;
  const digit = 11 - remainder;
  if (digit === 11) {
    return 0;
  }
  if (digit === 10) {
    return null;
  }
  return digit;
}

function makeValidOrganizationNumber(seed: number): string {
  const prefix = String(10000000 + (seed % 90000000)).padStart(8, "0");
  const check = checksumDigit(prefix, [3, 2, 7, 6, 5, 4, 3, 2]);
  if (check === null) {
    return makeValidOrganizationNumber(seed + 1);
  }
  return `${prefix}${check}`;
}

function makeValidBankAccountNumber(seed: number): string {
  const prefix = String(1000000000 + (seed % 9000000000)).padStart(10, "0");
  const check = checksumDigit(prefix, [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]);
  if (check === null) {
    return makeValidBankAccountNumber(seed + 1);
  }
  return `${prefix}${check}`;
}

async function ensureInvoiceCanBeCreated(
  customerId: number,
  vatTypeId: number,
): Promise<InvoiceLike> {
  const payload = {
    invoiceDate: RUN_DATE,
    invoiceDueDate: "2026-04-03",
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        orderDate: RUN_DATE,
        deliveryDate: RUN_DATE,
        orderLines: [
          {
            description: DESCRIPTION,
            count: 1,
            unitPriceExcludingVatCurrency: AMOUNT_EX_VAT,
            vatType: { id: vatTypeId },
          },
        ],
      },
    ],
  };

  try {
    const created = await api<Wrapper<InvoiceLike>>("/invoice?sendToCustomer=false", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!created.value) {
      throw new Error("Invoice create returned no value");
    }
    return created.value;
  } catch (error) {
    const message = String(error);
    if (!message.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.")) {
      throw error;
    }

    const bankAccounts = await api<Wrapper<LedgerAccount>>("/ledger/account?isBankAccount=true&fields=*");
    const invoiceAccount = (bankAccounts.values ?? []).find(
      (account) => account.isBankAccount === true && account.isInvoiceAccount === true,
    );

    if (!invoiceAccount) {
      throw new Error(`No invoice bank account available for repair\n${JSON.stringify(bankAccounts, null, 2)}`);
    }

    await api<Wrapper<LedgerAccount>>(`/ledger/account/${invoiceAccount.id}`, {
      method: "PUT",
      body: JSON.stringify({
        bankAccountNumber: makeValidBankAccountNumber(Date.now()),
      }),
    });

    const retried = await api<Wrapper<InvoiceLike>>("/invoice?sendToCustomer=false", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!retried.value) {
      throw new Error("Invoice retry returned no value");
    }
    return retried.value;
  }
}

async function main() {
  const suffix = Date.now();
  const organizationNumber = makeValidOrganizationNumber(suffix);
  const email = `credit-note-proof-${suffix}@example.com`;

  const vatTypes = await api<Wrapper<VatType>>(
    `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${RUN_DATE}&fields=*`,
  );
  const vatType = (vatTypes.values ?? [])[0];
  if (!vatType) {
    throw new Error(`No outgoing VAT type returned\n${JSON.stringify(vatTypes, null, 2)}`);
  }

  const customer = await api<Wrapper<Customer>>("/customer", {
    method: "POST",
    body: JSON.stringify({
      name: `Credit Note Proof ${suffix}`,
      email,
      organizationNumber,
    }),
  });
  if (!customer.value) {
    throw new Error("Customer create returned no value");
  }

  const originalInvoice = await ensureInvoiceCanBeCreated(customer.value.id, vatType.id);

  const search = new URLSearchParams({
    invoiceDateFrom: "2000-01-01",
    invoiceDateTo: INVOICE_DATE_TO,
    count: "1000",
    sorting: "-invoiceDate",
    fields: "*,customer(*),orderLines(*),orders(*,orderLines(*))",
  });
  const invoices = await api<Wrapper<InvoiceLike>>(`/invoice?${search.toString()}`);

  const matches = (invoices.values ?? []).filter((invoice) => {
    if (invoice.isCreditNote === true || invoice.isCredited === true) {
      return false;
    }

    const org = String(invoice.customer?.organizationNumber ?? "").trim();
    if (org !== organizationNumber) {
      return false;
    }

    const amount = invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat;
    if (amount !== AMOUNT_EX_VAT) {
      return false;
    }

    return getDescriptions(invoice).includes(DESCRIPTION);
  });

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one sandbox match, found ${matches.length}\n${JSON.stringify(
        matches.map((invoice) => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate,
          descriptions: getDescriptions(invoice),
          amountExcludingVat: invoice.amountExcludingVat,
          amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
          organizationNumber: invoice.customer?.organizationNumber,
        })),
        null,
        2,
      )}`,
    );
  }

  const located = matches[0];
  const credit = await api<Wrapper<InvoiceLike>>(
    `/invoice/${located.id}/:createCreditNote?date=${RUN_DATE}&sendToCustomer=false`,
    { method: "PUT" },
  );

  if (!credit.value) {
    throw new Error("Credit note create returned no value");
  }
  if (credit.value.isCreditNote !== true) {
    throw new Error(`Expected credit note response\n${JSON.stringify(credit.value, null, 2)}`);
  }
  if (getCreditedInvoiceId(credit.value.creditedInvoice) !== located.id) {
    throw new Error(
      `creditedInvoice mismatch\n${JSON.stringify(
        {
          locatedId: located.id,
          creditedInvoice: credit.value.creditedInvoice,
        },
        null,
        2,
      )}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        vatType: {
          id: vatType.id,
          number: vatType.number ?? null,
          percentage: vatType.percentage ?? null,
        },
        customer: {
          id: customer.value.id,
          organizationNumber,
          email,
        },
        originalInvoice: {
          id: originalInvoice.id,
          invoiceNumber: originalInvoice.invoiceNumber ?? null,
        },
        locateReadMatch: {
          id: located.id,
          invoiceNumber: located.invoiceNumber ?? null,
          descriptions: getDescriptions(located),
        },
        creditNote: {
          id: credit.value.id,
          invoiceNumber: credit.value.invoiceNumber ?? null,
          creditedInvoiceId: getCreditedInvoiceId(credit.value.creditedInvoice),
        },
      },
      null,
      2,
    ),
  );
}

await main();
